import { getSecret } from "./secrets.server";
import type {
  ApiEndpoint,
  ClassifiedFile,
  DataFlow,
  EnvReference,
  FileCategory,
  HealthCategory,
  InspectionEvent,
  InspectionResult,
  RepositoryAudit,
  Stack,
  StackDetection,
  TestAudit,
} from "./inspection.types";

/**
 * Real GitHub repository inspection.
 *
 * The GitHub token is read from process.env inside this module only, used
 * exclusively for api.github.com requests, and never returned, logged, stored
 * in the audit, or placed in any AI-facing payload.
 */

const MAX_FILE_BYTES = 180_000;
// A small/medium repository must be inspected as a whole, not sampled and then
// described as "comprehensive". Very large repositories remain bounded and are
// explicitly marked as partial in the audit contract.
const MAX_FILES_READ = 120;
const LARGE_REPO_FILES = 4000;

const UNK: StackDetection = { value: "UNKNOWN", evidence: [] };

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const patterns = [
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)$/i,
    /^git@github\.com:([^/\s]+)\/([^/\s]+)$/i,
    /^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/,
  ];
  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m && m[1] && m[2]) return { owner: m[1], repo: m[2] };
  }
  return null;
}

/** Remove anything token-shaped from provider text before it reaches a user. */
function safeMessage(message: string): string {
  return message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 240);
}

interface GhResponse {
  res: Response;
  rateLimit: { remaining: number; resetAt: string } | undefined;
}

async function gh(path: string, token: string | null): Promise<GhResponse> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "my-ai-dev-team",
  };
  // The token never leaves this request; it is not logged or returned.
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });

  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  return {
    res,
    rateLimit:
      remaining !== null
        ? {
            remaining: Number(remaining),
            resetAt: reset ? new Date(Number(reset) * 1000).toISOString() : "",
          }
        : undefined,
  };
}

/* ------------------------------------------------------------------ cache */

const cache = new Map<string, RepositoryAudit>();
// Bump when the analysis logic changes so stale audits are never served.
const ANALYSIS_VERSION = "2";
const cacheKey = (repo: string, branch: string, sha: string) =>
  `${ANALYSIS_VERSION}@${repo}@${branch}@${sha}`;

export function readCache(repo: string, branch: string, sha: string) {
  return cache.get(cacheKey(repo, branch, sha));
}
export function writeCache(audit: RepositoryAudit) {
  // A new commit SHA produces a new key, so stale inspections are never served.
  for (const key of cache.keys()) {
    if (key.includes(`@${audit.repository}@${audit.branch}@`)) cache.delete(key);
  }
  cache.set(cacheKey(audit.repository, audit.branch, audit.commitSha), audit);
}

/* --------------------------------------------------------- classification */

const GENERATED = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.next\//,
  /(^|\/)out\//,
  /(^|\/)node_modules\//,
  /(^|\/)coverage\//,
  /\.gen\.(t|j)sx?$/,
  /(^|\/)vendor\//,
];

export function classify(path: string): FileCategory {
  const p = path.toLowerCase();
  const base = p.split("/").pop() ?? p;

  if (GENERATED.some((r) => r.test(p))) return "GENERATED";
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|requirements\.txt|gemfile\.lock|go\.sum|cargo\.lock|composer\.lock)$/.test(p))
    return "DEPENDENCY";
  if (/(^|\/)(tests?|__tests__|spec|e2e|cypress|playwright)\//.test(p) || /\.(test|spec)\.[a-z]+$/.test(base) || /(^|\/)(jest|vitest|playwright|cypress)\.config\./.test(p))
    return "TEST";
  if (/(^|\/)(dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|render\.yaml|firebase\.json|wrangler\.(toml|jsonc?)|procfile|app\.yaml)$/.test(p) || /(^|\/)\.github\/workflows\//.test(p))
    return "DEPLOYMENT";
  if (/(^|\/)(prisma|drizzle|migrations|supabase\/migrations)\//.test(p) || /(schema\.prisma|schema\.sql)$/.test(base) || /\.sql$/.test(base))
    return "DATABASE";
  if (/(^|\/)(api|routes\/api|server|backend|functions|edge-functions|supabase\/functions)\//.test(p))
    return "API";
  if (/(^|\/)(server|backend)\b/.test(p) || /(^|\/)(server|app)\.(js|ts|py|rb|go)$/.test(base))
    return "BACKEND";
  if (/\.(md|mdx|rst|txt)$/.test(base)) return "DOCUMENTATION";
  if (/\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|mp4|mp3|avif)$/.test(base)) return "ASSET";
  if (/(^|\/)(package\.json|tsconfig[^/]*\.json|jsconfig\.json|vite\.config\.[a-z]+|next\.config\.[a-z]+|nuxt\.config\.[a-z]+|astro\.config\.[a-z]+|svelte\.config\.js|angular\.json|webpack\.config\.[a-z]+|rollup\.config\.[a-z]+|tailwind\.config\.[a-z]+|eslint\.config\.[a-z]+|\.eslintrc[^/]*|babel\.config\.[a-z]+|pyproject\.toml|setup\.py|go\.mod|cargo\.toml|composer\.json|gemfile|makefile|\.env\.example|\.env\.sample)$/.test(base))
    return "CONFIG";
  if (/\.(jsx|tsx|vue|svelte|css|scss|html|astro)$/.test(base)) return "FRONTEND";
  if (/\.(ts|js|mjs|cjs|py|rb|go|rs|java|php|cs|kt|swift)$/.test(base)) return "SOURCE";
  if (/\.(json|ya?ml|toml|ini|conf)$/.test(base)) return "CONFIG";
  return "UNKNOWN";
}

/* ----------------------------------------------------- file prioritisation */

const PRIORITY: { pattern: RegExp; score: number; reason: string }[] = [
  { pattern: /^package\.json$/, score: 100, reason: "Dependency and script manifest" },
  { pattern: /^(pyproject\.toml|requirements\.txt|go\.mod|cargo\.toml|composer\.json|gemfile)$/i, score: 95, reason: "Dependency manifest" },
  { pattern: /^(vite|next|nuxt|astro|svelte|webpack|rollup|angular)\.config\.[a-z.]+$/i, score: 90, reason: "Build tool configuration" },
  { pattern: /^angular\.json$/, score: 90, reason: "Build tool configuration" },
  { pattern: /^tsconfig(\.[a-z]+)?\.json$|^jsconfig\.json$/, score: 80, reason: "TypeScript/JS project configuration" },
  { pattern: /^readme\.md$/i, score: 78, reason: "Project documentation" },
  { pattern: /^(dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|render\.yaml|firebase\.json|wrangler\.(toml|jsonc?))$/i, score: 76, reason: "Deployment configuration" },
  { pattern: /^\.github\/workflows\/.+\.ya?ml$/, score: 70, reason: "CI workflow" },
  { pattern: /^(src\/)?(main|index|app|server)\.(t|j)sx?$/, score: 88, reason: "Application entry point" },
  { pattern: /^(src\/)?app\/(layout|page)\.(t|j)sx?$/, score: 85, reason: "App router entry" },
  { pattern: /^(src\/)?(pages|app)\/index\.(t|j)sx?$/, score: 84, reason: "Route entry" },
  { pattern: /^(src\/)?(api|server|backend|functions)\/.+\.(t|j)s$/, score: 74, reason: "Server/API module" },
  { pattern: /^(src\/)?routes\/api\/.+/, score: 74, reason: "API route" },
  { pattern: /^(prisma\/schema\.prisma|drizzle\.config\.[a-z]+)$/, score: 72, reason: "Database schema/config" },
  { pattern: /^supabase\/(config\.toml|migrations\/.+)$/, score: 70, reason: "Supabase configuration" },
  { pattern: /^\.env\.(example|sample)$/, score: 68, reason: "Environment variable template" },
  { pattern: /^(vitest|jest|playwright|cypress)\.config\.[a-z.]+$/, score: 66, reason: "Test configuration" },
];

function priorityOf(path: string): { score: number; reason: string } | null {
  for (const p of PRIORITY) if (p.pattern.test(path)) return { score: p.score, reason: p.reason };
  return null;
}

/* ------------------------------------------------------------- detections */

function detectStack(
  files: ClassifiedFile[],
  contents: Map<string, string>,
  repoLanguage: string | null,
): Stack {
  const paths = files.map((f) => f.path);
  const has = (re: RegExp) => paths.filter((p) => re.test(p));
  const pkgRaw = contents.get("package.json");
  let deps: Record<string, string> = {};
  let scripts: Record<string, string> = {};
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      scripts = pkg.scripts ?? {};
    } catch {
      /* malformed manifest — leave detections UNKNOWN */
    }
  }
  const dep = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  // frontend
  const fe: { label: string; evidence: string[] }[] = [];
  const push = (label: string, ev: string[]) => {
    if (ev.length) fe.push({ label, evidence: ev });
  };
  push("Next.js", [dep("next") && "package.json: next", ...has(/^next\.config\./)].filter(Boolean) as string[]);
  push("Nuxt", [dep("nuxt") && "package.json: nuxt", ...has(/^nuxt\.config\./)].filter(Boolean) as string[]);
  push("Astro", [dep("astro") && "package.json: astro", ...has(/^astro\.config\./)].filter(Boolean) as string[]);
  push("Angular", [dep("@angular/core") && "package.json: @angular/core", ...has(/^angular\.json$/)].filter(Boolean) as string[]);
  push("SvelteKit", [dep("@sveltejs/kit") && "package.json: @sveltejs/kit"].filter(Boolean) as string[]);
  push("Svelte", [dep("svelte") && "package.json: svelte"].filter(Boolean) as string[]);
  push("Vue", [dep("vue") && "package.json: vue"].filter(Boolean) as string[]);
  push("React", [dep("react") && "package.json: react", ...has(/\.tsx$/).slice(0, 2)].filter(Boolean) as string[]);
  push("Static HTML", has(/^(public\/)?index\.html$/));
  const buildTool = dep("vite") ? " + Vite" : "";
  const frontend: StackDetection = fe.length
    ? { value: fe[0]!.label + buildTool, evidence: fe[0]!.evidence.slice(0, 4) }
    : UNK;

  // backend
  const beEv: string[] = [];
  let beLabel = "";
  if (dep("express")) (beLabel = "Node · Express"), beEv.push("package.json: express");
  else if (dep("fastify")) (beLabel = "Node · Fastify"), beEv.push("package.json: fastify");
  else if (dep("@nestjs/core")) (beLabel = "NestJS"), beEv.push("package.json: @nestjs/core");
  else if (dep("hono")) (beLabel = "Hono"), beEv.push("package.json: hono");
  else if (dep("@tanstack/react-start")) (beLabel = "TanStack Start server functions"), beEv.push("package.json: @tanstack/react-start");
  else if (dep("next") && has(/^(src\/)?(app|pages)\/api\//).length)
    (beLabel = "Next.js API routes"), beEv.push(...has(/^(src\/)?(app|pages)\/api\//).slice(0, 3));
  else if (has(/^supabase\/functions\//).length)
    (beLabel = "Supabase Edge Functions"), beEv.push(...has(/^supabase\/functions\//).slice(0, 3));
  else if (contents.get("requirements.txt")?.match(/fastapi/i) || paths.some((p) => /main\.py$/.test(p)))
    (beLabel = "Python"), beEv.push(...paths.filter((p) => /\.py$/.test(p)).slice(0, 3));
  else if (has(/^(api|server|backend|functions)\//).length)
    (beLabel = "Custom server directory"), beEv.push(...has(/^(api|server|backend|functions)\//).slice(0, 3));
  const backend: StackDetection = beLabel ? { value: beLabel, evidence: beEv.slice(0, 4) } : UNK;

  // database
  const dbEv: string[] = [];
  let dbLabel = "";
  if (dep("@supabase/supabase-js") || has(/^supabase\//).length)
    (dbLabel = "Supabase (PostgreSQL)"), dbEv.push(...[dep("@supabase/supabase-js") && "package.json: @supabase/supabase-js", ...has(/^supabase\//).slice(0, 2)].filter(Boolean) as string[]);
  else if (dep("prisma") || dep("@prisma/client")) (dbLabel = "Prisma ORM"), dbEv.push("package.json: prisma", ...has(/schema\.prisma$/));
  else if (dep("drizzle-orm")) (dbLabel = "Drizzle ORM"), dbEv.push("package.json: drizzle-orm");
  else if (dep("mongoose") || dep("mongodb")) (dbLabel = "MongoDB"), dbEv.push("package.json: mongodb/mongoose");
  else if (dep("firebase") || has(/^firebase\.json$/).length) (dbLabel = "Firebase"), dbEv.push(...has(/^firebase\.json$/), "package.json: firebase");
  else if (dep("pg") || dep("postgres")) (dbLabel = "PostgreSQL"), dbEv.push("package.json: pg/postgres");
  else if (dep("better-sqlite3") || paths.some((p) => /\.sqlite3?$/.test(p))) (dbLabel = "SQLite"), dbEv.push("package.json: better-sqlite3");
  const database: StackDetection = dbLabel ? { value: dbLabel, evidence: dbEv.filter(Boolean).slice(0, 4) } : UNK;

  // deployment
  const depMap: [RegExp, string][] = [
    [/^vercel\.json$/, "Vercel"],
    [/^netlify\.toml$/, "Netlify"],
    [/^wrangler\.(toml|jsonc?)$/, "Cloudflare Workers"],
    [/^firebase\.json$/, "Firebase Hosting"],
    [/^fly\.toml$/, "Fly.io"],
    [/^render\.yaml$/, "Render"],
    [/^(dockerfile|docker-compose\.ya?ml)$/i, "Docker"],
    [/^\.github\/workflows\/.*(pages|deploy).*\.ya?ml$/i, "GitHub Actions deployment"],
  ];
  const deployHits = depMap
    .map(([re, label]) => ({ label, files: paths.filter((p) => re.test(p)) }))
    .filter((h) => h.files.length);
  const deployment: StackDetection = deployHits.length
    ? {
        value: deployHits.map((h) => h.label).join(", "),
        evidence: deployHits.flatMap((h) => h.files).slice(0, 5),
      }
    : UNK;

  // package manager
  const pmMap: [RegExp, string][] = [
    [/^bun\.lockb?$/, "bun"],
    [/^pnpm-lock\.yaml$/, "pnpm"],
    [/^yarn\.lock$/, "yarn"],
    [/^package-lock\.json$/, "npm"],
    [/^poetry\.lock$/, "poetry"],
    [/^requirements\.txt$/, "pip"],
    [/^go\.sum$/, "go modules"],
    [/^cargo\.lock$/, "cargo"],
  ];
  const pmHit = pmMap.map(([re, l]) => ({ l, f: paths.find((p) => re.test(p)) })).find((h) => h.f);
  const packageManager: StackDetection = pmHit?.f
    ? { value: pmHit.l, evidence: [pmHit.f] }
    : pkgRaw
      ? { value: "npm (assumed — no lockfile committed)", evidence: ["package.json"] }
      : UNK;

  // languages by extension frequency
  const extCount = new Map<string, number>();
  for (const f of files) {
    if (f.category === "GENERATED" || f.category === "ASSET") continue;
    const ext = f.path.includes(".") ? f.path.split(".").pop()! : "";
    const map: Record<string, string> = {
      ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
      py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", php: "PHP", cs: "C#",
      vue: "Vue", svelte: "Svelte", css: "CSS", scss: "CSS", html: "HTML", sql: "SQL",
    };
    const lang = map[ext];
    if (lang) extCount.set(lang, (extCount.get(lang) ?? 0) + 1);
  }
  const languages = [...extCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l} (${n})`);
  if (repoLanguage && !languages.some((l) => l.startsWith(repoLanguage))) languages.unshift(repoLanguage);

  void scripts;
  return { frontend, backend, database, deployment, packageManager, languages };
}

function detectEntryPoints(files: ClassifiedFile[], contents: Map<string, string>) {
  const paths = new Set(files.map((f) => f.path));
  const out: { path: string; role: string }[] = [];
  const add = (p: string, role: string) => {
    if (paths.has(p) && !out.some((o) => o.path === p)) out.push({ path: p, role });
  };

  const pkgRaw = contents.get("package.json");
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as { main?: string; module?: string; bin?: unknown };
      for (const key of ["main", "module"] as const) {
        const v = pkg[key];
        if (typeof v === "string") add(v.replace(/^\.\//, ""), `package.json "${key}"`);
      }
    } catch {
      /* ignore */
    }
  }
  for (const p of ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js", "src/index.tsx", "src/index.ts", "index.js", "index.ts", "main.py", "app.py", "main.go"])
    add(p, "Application entry");
  for (const p of ["src/App.tsx", "src/App.jsx", "src/App.vue", "src/app.tsx"]) add(p, "Root component");
  for (const p of ["src/routes/__root.tsx", "app/layout.tsx", "src/app/layout.tsx"]) add(p, "Root layout");
  for (const p of ["src/routes/index.tsx", "app/page.tsx", "src/app/page.tsx", "pages/index.tsx", "pages/index.js", "index.html", "public/index.html"])
    add(p, "Home route");
  for (const p of ["server.js", "server.ts", "src/server.ts", "src/server.js", "src/start.ts"]) add(p, "Server entry");
  return out.slice(0, 12);
}

function detectApis(files: ClassifiedFile[], contents: Map<string, string>): ApiEndpoint[] {
  const out: ApiEndpoint[] = [];
  // 1. File-system routed APIs
  for (const f of files) {
    const p = f.path;
    let route: string | null = null;
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^(?:src\/)?(?:app|pages)\/api\/(.+)\.(t|j)sx?$/)))
      route = "/api/" + m[1]!.replace(/\/(route|index)$/, "");
    else if ((m = p.match(/^(?:src\/)?routes\/api\/(.+)\.(t|j)sx?$/)))
      route = "/api/" + m[1]!.replace(/\/index$/, "");
    else if ((m = p.match(/^api\/(.+)\.(t|j)s$/))) route = "/api/" + m[1]!.replace(/\/index$/, "");
    else if ((m = p.match(/^supabase\/functions\/([^/]+)\/index\.ts$/)))
      route = "/functions/v1/" + m[1]!;
    if (!route) continue;
    const src = contents.get(p) ?? "";
    const methods = [...new Set([...src.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b\s*:/g)].map((x) => x[1]!))];
    out.push({
      method: methods.length ? methods.join(", ") : "UNKNOWN",
      path: route.replace(/\[([^\]]+)\]/g, ":$1"),
      file: p,
      purpose: src ? summarizePurpose(src) : "Not read (outside prioritised file budget)",
      authentication: src ? detectAuth(src) : "UNKNOWN",
      externalDependencies: src ? detectExternalDeps(src) : [],
    });
  }
  // 2. Express-style route registrations in read files
  for (const [path, src] of contents) {
    // Documentation shows illustrative snippets; they are not real endpoints.
    if (/\.(md|mdx|rst|txt)$/i.test(path)) continue;

    for (const m of src.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
      out.push({
        method: m[1]!.toUpperCase(),
        path: m[2]!,
        file: path,
        purpose: "Route handler registered in code",
        authentication: detectAuth(src),
        externalDependencies: detectExternalDeps(src),
      });
    }
  }
  return out.slice(0, 60);
}

function summarizePurpose(src: string): string {
  const doc = src.match(/\/\*\*([\s\S]{0,200}?)\*\//);
  if (doc) return doc[1]!.replace(/\s*\*\s*/g, " ").trim().slice(0, 120);
  const comment = src.match(/^\s*\/\/\s*(.+)$/m);
  if (comment) return comment[1]!.slice(0, 120);
  return "No description found in source";
}

function detectAuth(src: string): string {
  if (/requireSupabaseAuth|getUser\(\)|auth\.getSession|verifyJwt|jsonwebtoken/.test(src)) return "Session/JWT check present";
  if (/x-webhook-signature|createHmac|timingSafeEqual/.test(src)) return "Signature verification";
  if (/Authorization["'`\s:]+Bearer/.test(src)) return "Bearer token";
  return "UNKNOWN";
}

function detectExternalDeps(src: string): string[] {
  const hosts = new Set<string>();
  for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(m[1]!.toLowerCase());
  return [...hosts].slice(0, 5);
}

const ENV_IGNORE = /^(NODE_ENV|MODE|BASE_URL|DEV|PROD|SSR|PWD|PORT|CI)$/;

function detectEnv(contents: Map<string, string>): EnvReference[] {
  const map = new Map<string, Set<string>>();
  for (const [path, src] of contents) {
    const names = new Set<string>();
    for (const m of src.matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[\s*["'`]([A-Z0-9_]+)["'`]\s*\])/g))
      names.add((m[1] ?? m[2])!);
    for (const m of src.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) names.add(m[1]!);
    for (const m of src.matchAll(/Deno\.env\.get\(\s*["'`]([A-Z0-9_]+)["'`]/g)) names.add(m[1]!);
    for (const m of src.matchAll(/os\.environ(?:\.get\(\s*["']([A-Z0-9_]+)["']|\[\s*["']([A-Z0-9_]+)["'])/g))
      names.add((m[1] ?? m[2])!);
    if (/^\.env\./.test(path))
      for (const m of src.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)) names.add(m[1]!);
    for (const n of names) {
      if (ENV_IGNORE.test(n)) continue;
      if (!map.has(n)) map.set(n, new Set());
      map.get(n)!.add(path);
    }
  }
  // Names only — values are never captured, stored or displayed.
  return [...map.entries()]
    .map(([name, files]) => ({ name, referencedBy: [...files].slice(0, 6) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function detectTests(files: ClassifiedFile[], contents: Map<string, string>): TestAudit {
  const testFiles = files.filter((f) => f.category === "TEST").map((f) => f.path);
  const frameworks: string[] = [];
  const pkgRaw = contents.get("package.json");
  let commands: { name: string; command: string }[] = [];
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const fw of ["vitest", "jest", "mocha", "@playwright/test", "cypress", "ava", "node:test"])
        if (deps[fw]) frameworks.push(fw);
      const scripts = pkg.scripts ?? {};
      commands = Object.entries(scripts)
        .filter(([k]) => /^(test|lint|typecheck|type-check|check|e2e|build|dev|start)/.test(k))
        .map(([name, command]) => ({ name, command }));
    } catch {
      /* ignore */
    }
  }
  return {
    frameworks,
    testFiles: testFiles.slice(0, 20),
    commands,
    hasTests: testFiles.length > 0,
  };
}

function buildDataFlow(
  entryPoints: { path: string }[],
  apis: ApiEndpoint[],
  stack: Stack,
  contents: Map<string, string>,
): DataFlow[] {
  const flows: DataFlow[] = [];
  const uiFiles = entryPoints.map((e) => e.path).filter((p) => /\.(tsx|jsx|vue|svelte|html)$/.test(p));
  if (uiFiles.length && apis.length) {
    const externals = [...new Set(apis.flatMap((a) => a.externalDependencies))].slice(0, 4);
    const steps = [
      { label: "UI", files: uiFiles.slice(0, 3) },
      { label: "API", files: [...new Set(apis.map((a) => a.file))].slice(0, 4) },
    ];
    if (stack.database.value !== "UNKNOWN")
      steps.push({ label: `Data (${stack.database.value})`, files: stack.database.evidence.slice(0, 3) });
    if (externals.length) steps.push({ label: "External services", files: externals });
    flows.push({ title: "Client request path", steps });
  } else if (uiFiles.length) {
    const clientCalls = [...contents.entries()]
      .filter(([, src]) => /fetch\(|axios\./.test(src))
      .map(([p]) => p)
      .slice(0, 4);
    if (clientCalls.length)
      flows.push({
        title: "Client-side data access",
        steps: [
          { label: "UI", files: uiFiles.slice(0, 3) },
          { label: "Direct HTTP calls", files: clientCalls },
        ],
      });
  }
  return flows;
}

function buildHealth(
  audit: Omit<RepositoryAudit, "health" | "risks" | "unknowns" | "events">,
): HealthCategory[] {
  const h: HealthCategory[] = [];
  h.push({
    category: "Architecture",
    status: audit.entryPoints.length ? "GOOD" : "UNKNOWN",
    evidence: audit.entryPoints.length
      ? `${audit.entryPoints.length} entry points identified`
      : "No recognised entry point files",
  });
  const srcCount = audit.counts.byCategory["SOURCE"] ?? 0;
  const feCount = audit.counts.byCategory["FRONTEND"] ?? 0;
  h.push({
    category: "Code Organization",
    status: audit.directories.length >= 3 ? "GOOD" : audit.directories.length ? "PARTIAL" : "UNKNOWN",
    evidence: `${audit.directories.length} top-level source directories, ${srcCount + feCount} source files`,
  });
  h.push({
    category: "Testing",
    status: audit.tests.hasTests ? "GOOD" : audit.tests.commands.some((c) => c.name.startsWith("test")) ? "PARTIAL" : "WEAK",
    evidence: audit.tests.hasTests
      ? `${audit.tests.testFiles.length} test files, frameworks: ${audit.tests.frameworks.join(", ") || "UNKNOWN"}`
      : "No test files found in the repository tree",
  });
  const envInSource = audit.envReferences.filter((e) => e.referencedBy.some((f) => /^(src\/)?(components|pages|app)\//.test(f)));
  h.push({
    category: "Security",
    status: audit.envReferences.length === 0 ? "UNKNOWN" : envInSource.length ? "PARTIAL" : "GOOD",
    evidence: audit.envReferences.length
      ? `${audit.envReferences.length} env variable names referenced${envInSource.length ? `, ${envInSource.length} referenced from UI-layer files` : ""}`
      : "No environment variable references found in the inspected files",
  });
  h.push({
    category: "Deployment",
    status: audit.stack.deployment.value === "UNKNOWN" ? "UNKNOWN" : "GOOD",
    evidence: audit.stack.deployment.evidence.join(", ") || "No deployment configuration files found",
  });
  const docs = audit.counts.byCategory["DOCUMENTATION"] ?? 0;
  h.push({
    category: "Documentation",
    status: docs >= 3 ? "GOOD" : docs >= 1 ? "PARTIAL" : "WEAK",
    evidence: `${docs} documentation files in the tree`,
  });
  h.push({
    category: "Maintainability",
    status:
      audit.stack.packageManager.value !== "UNKNOWN" && audit.buildCommand !== "UNKNOWN" ? "GOOD" : "PARTIAL",
    evidence: `Package manager: ${audit.stack.packageManager.value}; build command: ${audit.buildCommand}`,
  });
  return h;
}

/* -------------------------------------------------------------- inspector */

export async function inspectRepositoryReal(input: {
  repoUrl: string;
  branch: string;
}): Promise<InspectionResult> {
  const events: InspectionEvent[] = [];
  const now = () => new Date().toISOString();
  const push = (label: string, state: InspectionEvent["state"], detail: string) => {
    events.push({ label, state, detail, at: now() });
  };
  const fail = (
    error: string,
    errorKind: InspectionResult["errorKind"],
    rateLimit?: InspectionResult["rateLimit"],
  ): InspectionResult => ({ ok: false, error, errorKind, events, rateLimit });

  let token: string | null = getSecret("GITHUB_TOKEN") ?? null;
  if (!token)
    push(
      "No GitHub credential configured",
      "warn",
      "Continuing with unauthenticated public access (lower rate limit, public repositories only)",
    );

  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return fail("Repository URL is not a valid github.com/owner/repo reference.", "invalid_url");

  let rateLimit: InspectionResult["rateLimit"];

  // 1. repository access
  let repoRes: GhResponse;
  try {
    repoRes = await gh(`/repos/${parsed.owner}/${parsed.repo}`, token);
    if (repoRes.res.status === 401 && token) {
      // Stored credential was rejected — fall back to public access so public
      // repositories remain inspectable, and tell the user plainly.
      token = null;
      push(
        "Stored GitHub credential rejected",
        "warn",
        "GitHub returned 401. Falling back to unauthenticated public access — private repositories will not be reachable until a valid token is stored.",
      );
      repoRes = await gh(`/repos/${parsed.owner}/${parsed.repo}`, token);
    }
  } catch {
    return fail("Could not reach the GitHub API. Check network connectivity and retry.", "network");
  }
  rateLimit = repoRes.rateLimit;
  if (!repoRes.res.ok) {
    const s = repoRes.res.status;
    if (s === 401) return fail("The stored GitHub credential was rejected. Re-add a valid token.", "unauthorized", rateLimit);
    if (s === 403 && rateLimit?.remaining === 0)
      return fail(
        `GitHub API rate limit reached. Access resets at ${rateLimit.resetAt || "an unknown time"}. Inspection was not retried.`,
        "rate_limit",
        rateLimit,
      );
    if (s === 403) return fail("Access to this repository is forbidden for the stored credential.", "forbidden", rateLimit);
    if (s === 404)
      return fail(
        token
          ? "Repository not found, or the stored credential cannot see it."
          : "Repository not found. Private repositories require a valid GitHub token to be stored.",
        "not_found",
        rateLimit,
      );
    return fail(safeMessage(`GitHub returned ${s} for the repository request.`), "unknown", rateLimit);
  }

  const repo = (await repoRes.res.json()) as {
    full_name: string;
    default_branch: string;
    private: boolean;
    language: string | null;
    size: number;
  };
  push("Repository verified", "ok", repo.full_name);

  // 2. branch + commit
  const branchRes = await gh(
    `/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(input.branch)}`,
    token,
  );
  rateLimit = branchRes.rateLimit ?? rateLimit;
  if (!branchRes.res.ok) {
    if (branchRes.res.status === 404)
      return fail(
        `Branch "${input.branch}" does not exist. The default branch is "${repo.default_branch}".`,
        "invalid_branch",
        rateLimit,
      );
    return fail(safeMessage(`GitHub returned ${branchRes.res.status} for the branch request.`), "unknown", rateLimit);
  }
  const branch = (await branchRes.res.json()) as {
    name: string;
    commit: { sha: string; commit: { message: string; author: { name: string; date: string } } };
  };
  const commitSha = branch.commit.sha;
  push("Branch verified", "ok", `${branch.name} @ ${commitSha.slice(0, 7)}`);

  // cache by repository + branch + commit sha
  const cached = readCache(repo.full_name, branch.name, commitSha);
  if (cached) {
    push("Cached inspection reused", "ok", `Commit ${commitSha.slice(0, 7)} unchanged since last inspection`);
    const cachedEvents = [...cached.events, events[events.length - 1]!];
    return { ok: true, audit: { ...cached, events: cachedEvents }, cached: true, events: cachedEvents, rateLimit };
  }

  // 3. tree
  const treeRes = await gh(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees/${commitSha}?recursive=1`,
    token,
  );
  rateLimit = treeRes.rateLimit ?? rateLimit;
  if (!treeRes.res.ok)
    return fail(safeMessage(`Could not read the repository tree (GitHub returned ${treeRes.res.status}).`), "unknown", rateLimit);
  const tree = (await treeRes.res.json()) as {
    tree: { path: string; type: string; size?: number }[];
    truncated: boolean;
  };
  const blobs = tree.tree.filter((t) => t.type === "blob");
  if (blobs.length === 0) return fail("This repository is empty — there are no files to inspect.", "empty_repository", rateLimit);

  const files: ClassifiedFile[] = blobs.map((b) => ({
    path: b.path,
    size: b.size ?? 0,
    category: classify(b.path),
  }));
  const largeRepository = blobs.length > LARGE_REPO_FILES || tree.truncated;
  push(
    "Repository tree loaded",
    tree.truncated ? "warn" : "ok",
    `${files.length} files${tree.truncated ? " (GitHub truncated the tree — inspection covers the returned subset)" : ""}`,
  );
  push("Files classified", "ok", `${new Set(files.map((f) => f.category)).size} categories`);

  // 4. prioritise + read
  const candidates = files
    .filter((f) => f.category !== "GENERATED" && f.category !== "ASSET")
    .map((f) => ({ f, p: priorityOf(f.path) }))
    .filter((x): x is { f: ClassifiedFile; p: { score: number; reason: string } } => x.p !== null)
    .sort((a, b) => b.p.score - a.p.score);

  const extraApi = files
    .filter(
      (f) =>
        (f.category === "API" || f.category === "BACKEND") &&
        /\.(t|j)sx?$|\.py$/.test(f.path) &&
        !candidates.some((c) => c.f.path === f.path),
    )
    .slice(0, 10)
    .map((f) => ({ f, p: { score: 60, reason: "API/backend module" } }));

  // Fill the remaining budget with every inspectable text file. Priority files
  // still come first, but a 76-file project is no longer silently sampled.
  const chosen = new Set([...candidates, ...extraApi].map((c) => c.f.path));
  const extraSource = files
    .filter(
      (f) =>
        !chosen.has(f.path) &&
        f.category !== "GENERATED" &&
        f.category !== "ASSET" &&
        f.size <= MAX_FILE_BYTES,
    )
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))
    .map((f) => ({ f, p: { score: 40, reason: "Repository text file" } }));

  const toRead = [...candidates, ...extraApi, ...extraSource]
    .filter((c) => c.f.size <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES_READ);
  const inspectableFiles = files.filter(
    (file) =>
      file.category !== "GENERATED" &&
      file.category !== "ASSET" &&
      file.size <= MAX_FILE_BYTES,
  ).length;


  const owner = parsed!.owner;
  const repoName = parsed!.repo;
  const contents = new Map<string, string>();
  const unreadable: string[] = [];


  async function readOne(path: string): Promise<"ok" | "fail" | "abort"> {
    try {
      const r = await gh(
        `/repos/${parsed.owner}/${parsed.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${commitSha}`,
        token,
      );
      rateLimit = r.rateLimit ?? rateLimit;
      if (r.res.status === 403 && r.rateLimit?.remaining === 0) return "abort";
      if (!r.res.ok) return "fail";
      const body = (await r.res.json()) as { content?: string; encoding?: string };
      if (body.encoding === "base64" && body.content) {
        contents.set(path, Buffer.from(body.content, "base64").toString("utf8"));
        return "ok";
      }
      return "fail";
    } catch {
      return "fail";
    }
  }

  let aborted = false;
  for (const c of toRead) {
    if (aborted) break;
    const state = await readOne(c.f.path);
    if (state === "abort") {
      aborted = true;
      push("Rate limit reached while reading files", "warn", `Continuing with ${contents.size} files already read`);
      break;
    }
    if (state === "fail") unreadable.push(c.f.path);
  }

  // One retry pass for transient GitHub failures before declaring partial coverage.
  if (!aborted && unreadable.length > 0) {
    const retryList = [...unreadable];
    unreadable.length = 0;
    for (const path of retryList) {
      const state = await readOne(path);
      if (state === "abort") {
        aborted = true;
        break;
      }
      if (state === "fail") unreadable.push(path);
    }
  }

  // Files GitHub cannot serve as decodable text (binary, symlink, submodule,
  // oversized blob) are not inspectable — they must not make coverage partial.
  const effectiveInspectable = Math.max(0, inspectableFiles - unreadable.length);
  const coverageComplete = !tree.truncated && !aborted && contents.size >= effectiveInspectable;
  push(
    "Relevant files read",
    coverageComplete ? "ok" : "warn",
    `${contents.size} of ${effectiveInspectable} inspectable text files read (${files.length} total files${
      unreadable.length ? `, ${unreadable.length} not servable as text` : ""
    })`,
  );


  // 5. analysis
  const stack = detectStack(files, contents, repo.language);
  push("Technology stack detected", "ok", `${stack.frontend.value} / ${stack.backend.value}`);
  const entryPoints = detectEntryPoints(files, contents);
  push("Entry points detected", entryPoints.length ? "ok" : "warn", entryPoints.map((e) => e.path).join(", ") || "none recognised");
  const apiMap = detectApis(files, contents);
  push("API surface analyzed", "ok", `${apiMap.length} endpoints found`);
  const envReferences = detectEnv(contents);
  push("Environment references collected", "ok", `${envReferences.length} variable names (no values read)`);
  const tests = detectTests(files, contents);
  push("Test and script audit", tests.hasTests ? "ok" : "warn", tests.hasTests ? `${tests.testFiles.length} test files` : "no test files found");

  const byCategory: Record<string, number> = {};
  for (const f of files) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;

  const dirCount = new Map<string, number>();
  for (const f of files) {
    if (f.category === "GENERATED") continue;
    const top = f.path.includes("/") ? f.path.split("/")[0]! : "(root)";
    dirCount.set(top, (dirCount.get(top) ?? 0) + 1);
  }
  const roleFor = (d: string) =>
    /^(src|app|pages|components|lib)$/.test(d) ? "Application source"
    : /^(api|server|backend|functions)$/.test(d) ? "Server / API"
    : /^(tests?|__tests__|e2e|cypress)$/.test(d) ? "Tests"
    : /^(public|static|assets)$/.test(d) ? "Static assets"
    : /^(supabase|prisma|drizzle|db|migrations)$/.test(d) ? "Database"
    : /^(docs?|documentation)$/.test(d) ? "Documentation"
    : /^\.github$/.test(d) ? "CI / automation"
    : "UNKNOWN";
  const directories = [...dirCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([path, n]) => ({ path, files: n, role: roleFor(path) }));

  const scripts = tests.commands;
  const buildCommand = scripts.find((s) => s.name === "build")?.command ?? "UNKNOWN";
  const devCommand = scripts.find((s) => s.name === "dev")?.command ?? scripts.find((s) => s.name === "start")?.command ?? "UNKNOWN";

  const importantFiles = toRead
    .map((c) => ({ path: c.f.path, category: c.f.category, reason: c.p.reason }))
    .slice(0, 20);

  const dataFlow = buildDataFlow(entryPoints, apiMap, stack, contents);

  const architecture: string[] = [];
  architecture.push(
    stack.frontend.value !== "UNKNOWN"
      ? `Frontend is built with ${stack.frontend.value}; evidence: ${stack.frontend.evidence.join(", ")}.`
      : "No frontend framework could be identified from the inspected files.",
  );
  architecture.push(
    stack.backend.value !== "UNKNOWN"
      ? `Server-side logic runs through ${stack.backend.value}${apiMap.length ? ` across ${apiMap.length} detected endpoints` : ""}.`
      : "No server-side layer was detected in the inspected files.",
  );
  architecture.push(
    stack.database.value !== "UNKNOWN"
      ? `Persistence uses ${stack.database.value}.`
      : "No database integration was detected.",
  );
  architecture.push(
    directories.length
      ? `Code is organised under ${directories.slice(0, 4).map((d) => d.path).join(", ")}.`
      : "Repository has a flat file layout.",
  );

  const risks: string[] = [];
  if (!tests.hasTests) risks.push("No test files exist in the repository tree — changes cannot be verified automatically.");
  if (stack.deployment.value === "UNKNOWN") risks.push("No deployment configuration was found; release process is undocumented.");
  if (stack.packageManager.value.includes("assumed")) risks.push("No lockfile is committed — dependency installs are not reproducible.");
  if (!coverageComplete)
    risks.push(
      `Inspection is partial: ${contents.size} of ${inspectableFiles} inspectable text files were read. Unread files were not audited.`,
    );
  const clientEnv = envReferences.filter((e) => e.referencedBy.some((f) => /^(src\/)?(components|pages|app|client)\//.test(f)) && !/^(VITE_|NEXT_PUBLIC_|PUBLIC_)/.test(e.name));
  if (clientEnv.length)
    risks.push(`Non-public environment variables referenced from client-layer files: ${clientEnv.map((e) => e.name).join(", ")}.`);
  if ((byCategory["GENERATED"] ?? 0) > 0) risks.push(`${byCategory["GENERATED"]} generated/build artefacts are committed to the repository.`);

  const unknowns: string[] = [];
  if (stack.backend.value === "UNKNOWN") unknowns.push("Backend technology");
  if (stack.database.value === "UNKNOWN") unknowns.push("Database technology");
  if (stack.deployment.value === "UNKNOWN") unknowns.push("Deployment target");
  if (buildCommand === "UNKNOWN") unknowns.push("Build command");
  if (!apiMap.length) unknowns.push("API surface (no endpoints detected)");
  if (tree.truncated) unknowns.push("Full file tree (GitHub truncated the response)");
  if (!coverageComplete)
    unknowns.push(
      `Contents of ${Math.max(0, inspectableFiles - contents.size)} inspectable text files not read (inspection limit or GitHub failure)`,
    );

  const base = {
    projectId: `${repo.full_name}#${branch.name}`,
    repository: repo.full_name,
    branch: branch.name,
    commitSha,
    commitMessage: branch.commit.commit.message.split("\n")[0] ?? "",
    commitDate: branch.commit.commit.author?.date ?? "",
    inspectedAt: now(),
    private: repo.private,
    truncatedTree: tree.truncated,
    largeRepository,
    counts: {
      totalFiles: files.length,
      inspectableFiles,
      inspectedFiles: contents.size,
      skippedFiles: files.length - contents.size,
      byCategory,
    },
    coverageComplete,
    inspectedPaths: [...contents.keys()].sort(),
    stack,
    entryPoints,
    importantFiles,
    directories,
    apiMap,
    dataFlow,
    envReferences,
    tests,
    buildCommand,
    devCommand,
    architecture,
  };

  const audit: RepositoryAudit = {
    ...base,
    health: buildHealth(base),
    risks,
    unknowns,
    events: [],
  };
  push("Architecture report generated", "ok", `${audit.risks.length} risks, ${audit.unknowns.length} unknowns`);
  audit.events = events;

  writeCache(audit);
  return { ok: true, audit, cached: false, events, rateLimit };
}
