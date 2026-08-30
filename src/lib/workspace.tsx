import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getSecretsStatus,
  testRepositoryConnection,
  testProvider,
  type ProviderStatus,
  type RepoConnectionResult,
} from "@/lib/connection.functions";
import { inspectRepository } from "@/lib/inspection.functions";
import { generateArchitecturePlan } from "@/lib/architect.functions";
import { implementPlan } from "@/lib/coder.functions";
import { reviewChangeSet } from "@/lib/review.functions";
import { commitStagedChanges } from "@/lib/git.functions";
import { teamLeadChat } from "@/lib/chat.functions";
import { getUserSecrets, subscribeUserSecrets } from "@/lib/user-secrets";
import type { RepositoryAudit } from "@/lib/inspection.types";
import type { ArchitectPlan } from "@/lib/architect.types";
import type { ChangeSet } from "@/lib/coder.types";
import type { ReviewBoardResult } from "@/lib/review.types";
import type { GitResult } from "@/lib/git.types";
import { bootstrapProjectState, checkpointProjectState } from "@/lib/state.functions";
import type {
  BootstrapResult,
  CheckpointRequest,
  StatePhase,
  AuditFacts,
  CurrentTask,
} from "@/lib/state.types";
export interface RepoConfig {
  repoUrl: string;
  branch: string;
}

export interface ProviderConfig {
  primaryProvider: ProviderId;
  primaryModel: string;
  fallbackProvider: FallbackProviderId;
  fallbackModel: string;
  freeOnly: boolean;
}

import { useActivity } from "@/lib/activity";
import { arabize } from "@/lib/ar";
/** Boolean flags for each configured secret (server env or vault). */
type SecretFlags = {
  github: boolean;
  openai: boolean;
  anthropic: boolean;
  gemini: boolean;
  openrouter: boolean;
  groq: boolean;
  mistral: boolean;
  huggingface: boolean;
  lovable: boolean;
};

import { pickModel, rankModels, taskKind, KEY_SOURCES, type TaskKind } from "@/lib/model-picker";
import {
  PROVIDER_IDS,
  FALLBACK_PROVIDER_IDS,
  type ProviderId,
  type FallbackProviderId,
} from "@/lib/architect.types";

/** Human-readable Arabic label for a provider id. */
const PROVIDER_LABEL: Record<ProviderId, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  lovable: "الذكاء المدمج",
  groq: "Groq",
  mistral: "Mistral",
  huggingface: "Hugging Face",
};

/**
 * Shared workspace state for the whole app.
 *
 * Holds the connected repository, the audit, the agent artefacts and the
 * Project Manager conversation, and runs the automatic agent pipeline
 * (Architect → Coder → Review Board → Git Manager) on the human's go-ahead.
 * Every value shown to the human comes from a real backend result.
 */

const CONFIG_KEY = "aidevteam.config.v1";

export type PipelinePhase =
  "idle" | "inspect" | "plan" | "code" | "review" | "git" | "done" | "failed";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Which agent produced this message (Arabic label). */
  agent?: string;
  model?: string;
  questions?: string[];
  suggestedTask?: string;
  nextStep?: string;
}

interface Ctx {
  repoConfig: RepoConfig;
  setRepoConfig: (c: RepoConfig) => void;
  providerConfig: ProviderConfig;
  setProviderConfig: (c: ProviderConfig) => void;
  repoResult: RepoConnectionResult | null;
  setRepoResult: (r: RepoConnectionResult | null) => void;
  audit: RepositoryAudit | null;
  setAudit: (a: RepositoryAudit | null) => void;
  plan: ArchitectPlan | null;
  changeSet: ChangeSet | null;
  review: ReviewBoardResult | null;
  gitResult: GitResult | null;
  providerStatuses: Partial<Record<ProviderId, ProviderStatus>>;
  setProviderStatus: (s: ProviderStatus) => void;
  keyStatus: SecretFlags;
  serverSecrets: SecretFlags;
  refreshSecrets: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  messages: ChatEntry[];
  chatBusy: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearChat: () => void;
  pipeline: { running: boolean; phase: PipelinePhase; note: string };
  runPipeline: (task: string) => Promise<void>;
  recoveredState: BootstrapResult | null;
  bootstrapState: () => Promise<void>;
}

const WorkspaceContext = createContext<Ctx | null>(null);

const HANDOFF =
  /(عطي|أعط|اعط|سلّم|سلم|بدا|ابدا|ابدأ|نفّذ|نفذ|طبّق|طبق|كمّل|كمل|go ahead|start|proceed|hand ?off)/i;

const AFFIRM = /^(نعم|أيوا|ايوا|واخا|موافق|أوافق|اوك|ok|okay|yes|yalah|يالله)[\s!.،]*$/i;

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { log, finish } = useActivity();

  const secretsStatusFn = useServerFn(getSecretsStatus);
  const providerFn = useServerFn(testProvider);
  const testRepoFn = useServerFn(testRepositoryConnection);
  const inspectFn = useServerFn(inspectRepository);
  const architectFn = useServerFn(generateArchitecturePlan);
  const coderFn = useServerFn(implementPlan);
  const reviewFn = useServerFn(reviewChangeSet);
  const gitFn = useServerFn(commitStagedChanges);
  const chatFn = useServerFn(teamLeadChat);
  const bootstrapStateFn = useServerFn(bootstrapProjectState);
  const checkpointFn = useServerFn(checkpointProjectState);

  const [repoConfig, setRepoConfig] = useState<RepoConfig>({ repoUrl: "", branch: "main" });
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({
    primaryProvider: "gemini",
    primaryModel: "",
    fallbackProvider: "none",
    fallbackModel: "",
    freeOnly: true,
  });
  const [repoResult, setRepoResult] = useState<RepoConnectionResult | null>(null);
  const [audit, setAudit] = useState<RepositoryAudit | null>(null);
  const [plan, setPlan] = useState<ArchitectPlan | null>(null);
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);
  const [review, setReview] = useState<ReviewBoardResult | null>(null);
  const [gitResult, setGitResult] = useState<GitResult | null>(null);
  const [recoveredState, setRecoveredState] = useState<BootstrapResult | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<
    Partial<Record<ProviderId, ProviderStatus>>
  >({});
  const [serverSecrets, setServerSecrets] = useState<SecretFlags>({
    github: false,
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: false,
    groq: false,
    mistral: false,
    huggingface: false,
    lovable: false,
  });
  const [secretTick, setSecretTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [pipeline, setPipeline] = useState<{
    running: boolean;
    phase: PipelinePhase;
    note: string;
  }>({ running: false, phase: "idle", note: "" });
  const [hydrated, setHydrated] = useState(false);

  const providerRef = useRef(providerConfig);
  providerRef.current = providerConfig;
  const auditRef = useRef(audit);
  auditRef.current = audit;
  const providerStatusRef = useRef(providerStatuses);
  providerStatusRef.current = providerStatuses;
  const repoConfigRef = useRef(repoConfig);
  repoConfigRef.current = repoConfig;
  const planRef = useRef(plan);
  planRef.current = plan;
  const changeSetRef = useRef(changeSet);
  changeSetRef.current = changeSet;
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const gitResultRef = useRef(gitResult);
  gitResultRef.current = gitResult;

  function forgetUnavailableModel(provider: ProviderId, model: string) {
    setProviderStatuses((prev) => {
      const current = prev[provider];
      if (!current) return prev;
      return {
        ...prev,
        [provider]: { ...current, models: current.models.filter((m) => m !== model) },
      };
    });
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { repo?: RepoConfig; provider?: ProviderConfig };
        if (parsed.repo) setRepoConfig(parsed.repo);
        if (parsed.provider) setProviderConfig(parsed.provider);
      }
    } catch {
      /* ignore malformed config */
    }
    setHydrated(true);
    const unsub = subscribeUserSecrets(() => setSecretTick((n) => n + 1));
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ repo: repoConfig, provider: providerConfig }),
    );
  }, [hydrated, repoConfig, providerConfig]);

  const refreshSecrets = useCallback(() => {
    setSecretTick((n) => n + 1);
    void secretsStatusFn({}).then((s) =>
      setServerSecrets({
        github: Boolean(s.github),
        openai: Boolean(s.openai),
        anthropic: Boolean(s.anthropic),
        gemini: Boolean(s.gemini),
        openrouter: Boolean(s.openrouter),
        groq: Boolean(s.groq),
        mistral: Boolean(s.mistral),
        huggingface: Boolean(s.huggingface),
        lovable: Boolean(s.lovable),
      }),
    );
  }, [secretsStatusFn]);

  useEffect(() => {
    refreshSecrets();
  }, [refreshSecrets]);

  // getUserSecrets() now returns {} — secrets come from the server-side vault.
  const keyStatus: SecretFlags = {
    github: serverSecrets.github,
    openai: serverSecrets.openai,
    anthropic: serverSecrets.anthropic,
    gemini: serverSecrets.gemini,
    openrouter: serverSecrets.openrouter,
    groq: serverSecrets.groq,
    mistral: serverSecrets.mistral,
    huggingface: serverSecrets.huggingface,
    lovable: serverSecrets.lovable,
  };

  function say(entry: Omit<ChatEntry, "id">) {
    setMessages((prev) => [...prev, { ...entry, id: id() }]);
  }

  const setProviderStatus = useCallback((s: ProviderStatus) => {
    setProviderStatuses((prev) => ({ ...prev, [s.provider]: s }));
  }, []);

  /**
   * Pick a usable model automatically.
   *
   * Lists the models the provider really offers, prefers the free ones and
   * scores them against the kind of work. Falls back to the other provider
   * when the first one has no key or no models.
   */
  const ensureModel = useCallback(
    async (kind: TaskKind = "plan", announce = false): Promise<string> => {
      const cfg = providerRef.current;
      // مجاني 100%: نستعمل غير مفاتيح المستخدم المجانية.
      // الذكاء المدمج (lovable) كيستهلك أرصدة، فما كنستعملوهش تلقائيا —
      // غير إلا المستخدم ختارو بنفسو من الإعدادات.
      const free = PROVIDER_IDS.filter((p) => p !== "lovable") as ProviderId[];
      const order: ProviderId[] =
        cfg.primaryProvider === "lovable"
          ? ["lovable", ...free]
          : [cfg.primaryProvider, ...free.filter((p) => p !== cfg.primaryProvider)];


      for (const provider of order) {
        let status = providerStatusRef.current[provider];
        if (!status || !status.ok) {
          status = await providerFn({ data: { provider, secrets: getUserSecrets() } });
          setProviderStatus(status);
        }
        if (!status.ok || status.models.length === 0) continue;
        const pick = pickModel(provider, status.models, kind);
        if (!pick) continue;
        if (provider !== cfg.primaryProvider || pick.model !== cfg.primaryModel) {
          const next = { ...cfg, primaryProvider: provider, primaryModel: pick.model };
          providerRef.current = next;
          setProviderConfig(next);
        }
        if (announce && pick.model !== cfg.primaryModel) {
          say({
            role: "assistant",
            agent: "مدير المشروع",
            model: pick.model,
            content: `${pick.reason} (المزوّد: ${PROVIDER_LABEL[provider]})`,
          });
        }
        return pick.model;
      }
      return "";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerFn, setProviderStatus],
  );

  function step(agent: string, action: string, model?: string) {
    const entryId = log({ agent, action, state: "running", ...(model ? { model } : {}) });
    return {
      ok: (detail?: string, m?: string) =>
        finish(entryId, {
          state: "done",
          ...(detail ? { detail } : {}),
          ...(m ? { model: m } : {}),
        }),
      fail: (detail: string) => finish(entryId, { state: "failed", detail }),
    };
  }

  /**
   * Reconstruct project context from `.ai-dev-hub/` in the repository.
   * Safe to call any time a repository is configured; non-fatal on failure.
   */
  const bootstrapState = useCallback(async () => {
    if (!repoConfigRef.current.repoUrl.trim()) return;
    const s = step("حارس الحالة", "استعادة حالة المشروع");
    try {
      const res = await bootstrapStateFn({
        data: {
          repoUrl: repoConfigRef.current.repoUrl,
          branch: repoConfigRef.current.branch,
          secrets: getUserSecrets(),
        },
      });
      setRecoveredState(res);
      if (res.ok && res.recovered.state) {
        s.ok(
          res.consistent
            ? `v${res.recovered.state.stateVersion} · متسق`
            : `v${res.recovered.state.stateVersion} · غير متسق: ${res.inconsistencies.length}`,
        );
      } else if (res.ok) {
        s.ok("لا توجد حالة سابقة");
      } else {
        s.fail(arabize(res.error ?? ""));
      }
    } catch {
      s.fail("انقطاع في الاتصال");
    }
  }, [bootstrapStateFn]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Persist a checkpoint into the repository's `.ai-dev-hub/`. Non-fatal: a
   * failure is logged but never breaks the pipeline. Reads all reactive
   * values from refs so the single stable instance always sees fresh state.
   */
  const checkpoint = useCallback(
    async (m: {
      repository: string;
      phase: StatePhase;
      completedPhases: StatePhase[];
      lastSuccess: string;
      lastFailure?: string | null;
      nextAction: string;
      task: CurrentTask;
      pendingWork?: string[];
      knownProblems: string[] | undefined;
      newDecisions: string[] | undefined;
    }) => {
      if (!m.repository) return;
      const cfg = providerRef.current;
      const audit = auditRef.current;
      const auditFacts: AuditFacts | null = audit
        ? {
            repository: audit.repository,
            branch: audit.branch,
            commitSha: audit.commitSha,
            frontend: audit.stack.frontend.value,
            backend: audit.stack.backend.value,
            database: audit.stack.database.value,
            deployment: audit.stack.deployment.value,
            packageManager: audit.stack.packageManager.value,
            languages: audit.stack.languages,
            entryPoints: audit.entryPoints.map((e) => e.path),
            apiRoutes: audit.apiMap.length,
            fileCount: audit.counts.totalFiles,
            buildCommand: audit.buildCommand,
            devCommand: audit.devCommand,
            envNames: audit.envReferences.map((e) => e.name),
            risks: audit.risks,
          }
        : null;
      const req = {
        repository: m.repository,
        branch: repoConfigRef.current.branch,
        phase: m.phase,
        completedPhases: m.completedPhases,
        capabilities: ["inspect", "plan", "code", "review", "git-commit", "state-persistence"],
        enabledIntegrations: ["github"],
        configuredProviders: cfg.primaryProvider ? [cfg.primaryProvider] : [],
        defaultModel: cfg.primaryModel || null,
        workspace: {
          hasAudit: Boolean(auditRef.current),
          hasPlan: Boolean(planRef.current),
          hasChangeSet: Boolean(changeSetRef.current),
          hasReview: Boolean(reviewRef.current),
          hasGitResult: Boolean(gitResultRef.current),
        },
        buildStatus: "unknown",
        testStatus: "unknown",
        pendingWork: m.pendingWork ?? m.task.remaining,
        knownProblems: m.knownProblems ?? [],
        lastSuccessfulOperation: m.lastSuccess,
        lastFailedOperation: m.lastFailure ?? null,
        recommendedNextAction: m.nextAction,
        task: m.task,
        auditFacts,
        newDecisions: m.newDecisions ?? [],
        secrets: getUserSecrets(),
      };
      try {
        const res = await checkpointFn({ data: req });
        if (res.ok) {
          log({
            agent: "حارس الحالة",
            action: "حفظ نقطة المرجع",
            state: "done",
            detail: `v${res.stateVersion} · ${res.commitSha?.slice(0, 7) ?? ""}`,
          });
        } else {
          log({
            agent: "حارس الحالة",
            action: "حفظ نقطة المرجع",
            state: "failed",
            detail: arabize(res.error ?? ""),
          });
        }
      } catch {
        log({ agent: "حارس الحالة", action: "حفظ نقطة المرجع", state: "failed", detail: "انقطاع" });
      }
    },
    [checkpointFn], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const runPipeline = useCallback(
    async (task: string) => {
      if (pipeline.running) return;
      let activeRepoResult: RepoConnectionResult | null = null;
      if (repoConfig.repoUrl.trim()) {
        activeRepoResult = await testRepoFn({
          data: { ...repoConfig, secrets: getUserSecrets() },
        });
        setRepoResult(activeRepoResult);
      }
      const repoName = activeRepoResult?.ok ? activeRepoResult.repository?.fullName : "";
      if (!repoName) {
        say({
          role: "assistant",
          agent: "مدير المشروع",
          content:
            "ما قدرنش نبدا: المستودع ماشي متصل. حل الإعدادات (الأيقونة فوق) ودخّل رابط المستودع والتوكن، ومن بعد نبداو.",
        });
        return;
      }
      // Reconstruct any prior project state from the repository before working.
      void bootstrapState();
      const model = await ensureModel(taskKind(task), true);
      if (!model) {
        say({
          role: "assistant",
          agent: "مدير المشروع",
          content: "ما قدرنش نبدا: ما لقيتش نموذج ذكاء اصطناعي خدّام دابا. عاود جرّب بعد شوية.",
        });
        return;
      }
      const cfg = providerRef.current;
      const backupModels = rankModels(
        cfg.primaryProvider,
        providerStatusRef.current[cfg.primaryProvider]?.models ?? [],
        taskKind(task),
      )
        .filter((candidate) => candidate.model !== model)
        .slice(0, 2)
        .map((candidate) => candidate.model);
      const fallbackProvider =
        cfg.fallbackProvider !== "none" && cfg.fallbackModel
          ? cfg.fallbackProvider
          : backupModels[0]
            ? cfg.primaryProvider
            : "none";
      const fallbackModel =
        cfg.fallbackProvider !== "none" && cfg.fallbackModel
          ? cfg.fallbackModel
          : (backupModels[0] ?? "");

      setPipeline({ running: true, phase: "inspect", note: "" });
      setGitResult(null);
      say({
        role: "assistant",
        agent: "مدير المشروع",
        content: `واخا. سلّمت المهمة للفريق:\n«${task}»\nغادي نتبع معاك كل خطوة هنا.`,
      });

      const ts = () => new Date().toISOString();
      const checkpointAt = (
        phase: StatePhase,
        completedPhases: StatePhase[],
        lastSuccess: string,
        nextAction: string,
        status: CurrentTask["status"],
        remaining: string[],
        lastAction: string,
        extra?: { lastFailure?: string | null; knownProblems?: string[]; newDecisions?: string[] },
      ) =>
        checkpoint({
          repository: repoName,
          phase,
          completedPhases,
          lastSuccess,
          lastFailure: extra?.lastFailure ?? null,
          nextAction,
          task: {
            task,
            status,
            phase,
            completed: completedPhases,
            remaining,
            lastAction,
            nextAction,
            updatedAt: ts(),
          },
          knownProblems: extra?.knownProblems,
          newDecisions: extra?.newDecisions,
        });

      try {
        // 1) Repository audit (reuse the existing one when available).
        let currentAudit = auditRef.current;
        if (
          currentAudit &&
          (currentAudit.repository !== repoName || currentAudit.branch !== repoConfig.branch)
        ) {
          currentAudit = null;
        }
        if (!currentAudit) {
          const s = step("فاحص المستودع", "قراءة ملفات المستودع");
          const res = await inspectFn({
            data: {
              repoUrl: repoConfig.repoUrl,
              branch: repoConfig.branch,
              secrets: getUserSecrets(),
            },
          });
          if (!res.ok || !res.audit) {
            s.fail(arabize(res.error ?? ""));
            throw new Error(arabize(res.error ?? "فشل فحص المستودع."));
          }
          currentAudit = res.audit;
          setAudit(res.audit);
          s.ok(
            `${res.audit.counts.inspectedFiles}/${res.audit.counts.inspectableFiles} ملف نصي قابل للفحص`,
          );
          say({
            role: "assistant",
            agent: "فاحص المستودع",
            content: res.audit.coverageComplete
              ? `فحصت جميع الملفات النصية القابلة للفحص: ${res.audit.counts.inspectedFiles} من ${res.audit.counts.inspectableFiles} (${res.audit.counts.totalFiles} ملف إجمالًا)، ووجدت ${res.audit.apiMap.length} مسار API، عند النسخة ${res.audit.commitSha.slice(0, 7)}.`
              : `الفحص جزئي: قريت ${res.audit.counts.inspectedFiles} من ${res.audit.counts.inspectableFiles} ملف نصي قابل للفحص (${res.audit.counts.totalFiles} ملف إجمالًا). الملفات اللي ما تقراتش ما غاديش ندّعي أننا فحصناها.`,
          });
          await checkpointAt("inspect", ["inspect"], "Repository inspected", "Generate architecture plan", "in_progress", ["plan", "code", "review", "git"], "Repository inspected");
        }

        // 2) Architect plan.
        setPipeline({ running: true, phase: "plan", note: "" });
        const sPlan = step("المهندس المعماري", "إنشاء الخطة التقنية", model);
        const planRes = await architectFn({
          data: {
            projectId: currentAudit.projectId,
            request: task,
            primaryProvider: cfg.primaryProvider,
            primaryModel: model,
            backupModels,
            fallbackProvider,
            fallbackModel,
            secrets: getUserSecrets(),
          },
        });
        if (!planRes.ok || !planRes.plan) {
          const attempts = planRes.attempts
            .map((attempt) => `${attempt.model}: ${arabize(attempt.detail)}`)
            .join("\n");
          const detail = attempts || arabize(planRes.error ?? "المهندس ما قدرش يصاوب الخطة.");
          sPlan.fail(detail);
          throw new Error(`المهندس ما قدرش يصاوب الخطة.\n${detail}`);
        }
        const newPlan = planRes.plan;
        setPlan(newPlan);
        setChangeSet(null);
        setReview(null);
        sPlan.ok(`${newPlan.steps.length} خطوة`, newPlan.model);
        say({
          role: "assistant",
          agent: "المهندس المعماري",
          model: newPlan.model,
          content: `الخطة جاهزة (${newPlan.steps.length} خطوة):\n${newPlan.summary}`,
        });
        await checkpointAt("plan", ["inspect", "plan"], "Architecture plan generated", "Implement the plan with the Coder", "in_progress", ["code", "review", "git"], "Plan generated");

        // 3) Coder.
        setPipeline({ running: true, phase: "code", note: "" });
        const codeCandidates = rankModels(
          cfg.primaryProvider,
          providerStatusRef.current[cfg.primaryProvider]?.models ?? [],
          "code",
        )
          .map((candidate) => candidate.model)
          .filter((candidate) => candidate !== newPlan.model);
        const codeModel = codeCandidates[0] ?? model;
        const sCode = step("المبرمج", "كتابة التعديلات على الملفات", codeModel);
        const coderRes = await coderFn({
          data: {
            plan: newPlan,
            stepOrders: newPlan.steps.map((st) => st.order),
            primaryProvider: cfg.primaryProvider,
            primaryModel: codeModel,
            backupModels: codeCandidates.slice(1, 3),
            fallbackProvider,
            fallbackModel,
            secrets: getUserSecrets(),
          },
        });
        if (!coderRes.ok || !coderRes.changeSet) {
          sCode.fail(arabize(coderRes.error ?? ""));
          throw new Error(arabize(coderRes.error ?? "المبرمج ما قدرش يكتب التعديلات."));
        }
        const cs = coderRes.changeSet;
        setChangeSet(cs);
        sCode.ok(
          `${cs.totals.files} ملف · +${cs.totals.additions}/-${cs.totals.deletions}`,
          cs.model,
        );
        say({
          role: "assistant",
          agent: "المبرمج",
          model: cs.model,
          content: `كتبت التعديلات: ${cs.totals.files} ملف (+${cs.totals.additions} / -${cs.totals.deletions}). تقدر تشوفها فصفحة «العمل».`,
        });
        await checkpointAt("code", ["inspect", "plan", "code"], "Code changes staged", "Review the staged diff", "in_progress", ["review", "git"], "Diff staged for review");

        // 4) Review board.
        setPipeline({ running: true, phase: "review", note: "" });
        const sRev = step("مجلس المراجعة", "مراجعة الكود والأمان والجودة", model);
        const revRes = await reviewFn({
          data: {
            changeSetId: cs.changeSetId,
            taskId: cs.taskId,
            request: cs.request,
            repository: cs.repository,
            branch: cs.branch,
            baseCommitSha: cs.baseCommitSha,
            summary: cs.summary,
            files: cs.files.map((f) => ({
              path: f.path,
              action: f.action,
              reason: f.reason,
              additions: f.additions,
              deletions: f.deletions,
              diffText: f.diff.map((l) => l.text).join("\n"),
            })),
            reviewers: ["code", "security", "qa"] as ("code" | "security" | "qa")[],
            primaryProvider: cfg.primaryProvider,
            primaryModel: model,
            fallbackProvider,
            fallbackModel,
            secrets: getUserSecrets(),
          },
        });
        setReview(revRes);
        if (!revRes.ok) {
          sRev.fail(arabize(revRes.error ?? ""));
          throw new Error(arabize(revRes.error ?? "المراجعة فشلات."));
        }
        sRev.ok(
          `${revRes.gate === "APPROVED" ? "موافقة" : "مطلوب تعديلات"} · ${revRes.totals.blockers} مانع`,
          revRes.reports[0]?.model ?? model,
        );
        say({
          role: "assistant",
          agent: "مجلس المراجعة",
          model: revRes.reports[0]?.model ?? model,
          content:
            revRes.gate === "APPROVED"
              ? `المراجعة دازت بنجاح ✅ (${revRes.totals.majors} ملاحظة مهمة، ${revRes.totals.minors} بسيطة).`
              : `المراجعة طلبات تعديلات ⚠️: ${revRes.totals.blockers} مشكل مانع و${revRes.totals.majors} ملاحظة خطيرة. ما غاديش نرسلو الكود لـ GitHub.`,
        });
        await checkpointAt(
          "review",
          ["inspect", "plan", "code", "review"],
          `Review ${revRes.gate === "APPROVED" ? "approved" : "changes requested"}`,
          revRes.gate === "APPROVED" ? "Commit to a new branch and open a PR" : "Address review findings",
          revRes.gate === "APPROVED" ? "in_progress" : "blocked",
          revRes.gate === "APPROVED" ? ["git"] : ["code", "review", "git"],
          "Review board completed",
          { knownProblems: revRes.gate === "APPROVED" ? [] : [`${revRes.totals.blockers} blocker(s), ${revRes.totals.majors} major(s)`] },
        );

        if (revRes.gate !== "APPROVED") {
          setPipeline({ running: false, phase: "done", note: "changes_requested" });
          say({
            role: "assistant",
            agent: "مدير المشروع",
            content:
              "وقفنا هنا حرصًا على المشروع. شوف الملاحظات فصفحة «العمل»، وإلا بغيتي نعاودو المحاولة قول لي «عاود».",
          });
          return;
        }

        // 5) Git manager — only with write access.
        const writeAccess = activeRepoResult?.ok
          ? Boolean(activeRepoResult.repository?.writeAccess)
          : false;
        if (!writeAccess) {
          setPipeline({ running: false, phase: "done", note: "no_write" });
          say({
            role: "assistant",
            agent: "مدير Git",
            content:
              "التعديلات موافَق عليها، ولكن التوكن ديالك للقراءة فقط، لهذا ما قدرنش نصاوب الفرع والـ Pull Request. زيد توكن فيه صلاحية repo من الإعدادات ونكمل.",
          });
          return;
        }

        setPipeline({ running: true, phase: "git", note: "" });
        const sGit = step("مدير Git", "إنشاء فرع جديد وإرسال التعديلات");
        const slug =
          (cs.request || cs.taskId)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "change";
        const gitRes = await gitFn({
          data: {
            changeSet: {
              changeSetId: cs.changeSetId,
              taskId: cs.taskId,
              request: cs.request,
              repository: cs.repository,
              branch: cs.branch,
              baseCommitSha: cs.baseCommitSha,
              summary: cs.summary,
              files: cs.files.map((f) => ({ path: f.path, action: f.action, after: f.after })),
            },
            branchName: `ai-dev-team/${slug}-${cs.changeSetId.slice(0, 8)}`,
            commitMessage: cs.summary || cs.request,
            openPullRequest: true,
            dryRun: false,
            secrets: getUserSecrets(),
          },
        });
        setGitResult(gitRes);
        if (!gitRes.ok || !gitRes.report) {
          sGit.fail(arabize(gitRes.error ?? ""));
          throw new Error(arabize(gitRes.error ?? "مدير Git ما قدرش يرسل التعديلات."));
        }
        sGit.ok(gitRes.report.branch);
        say({
          role: "assistant",
          agent: "مدير Git",
          content: `تسالت الخدمة ✅\nالفرع: ${gitRes.report.branch}\n${
            gitRes.report.pullRequest
              ? `Pull Request رقم ${gitRes.report.pullRequest.number}: ${gitRes.report.pullRequest.url}`
              : "ما تصاوبش Pull Request."
          }`,
        });
        await checkpointAt(
          "done",
          ["inspect", "plan", "code", "review", "git"],
          `Committed to ${gitRes.report.branch}${gitRes.report.pullRequest ? ` and opened PR #${gitRes.report.pullRequest.number}` : ""}`,
          "Merge the PR and re-inspect, or start a new task",
          "completed",
          [],
          "Changes committed and PR opened",
        );
        setPipeline({ running: false, phase: "done", note: "" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "وقع مشكل غير متوقع.";
        await checkpointAt("failed", [], "—", "Fix the failure and retry", "failed", ["inspect", "plan", "code", "review", "git"], "Pipeline failed", { lastFailure: msg, knownProblems: [msg] });
        setPipeline({ running: false, phase: "failed", note: msg });
        say({
          role: "assistant",
          agent: "مدير المشروع",
          content: `وقفنا: ${msg}\nقول لي «عاود» ونعاودو، لا صحّح الإعدادات وعاود.`,
        });
      }
    },
    [
      architectFn,
      coderFn,
      ensureModel,
      gitFn,
      inspectFn,
      pipeline.running,
      repoConfig.branch,
      repoConfig.repoUrl,
      reviewFn,
      testRepoFn,
    ], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || chatBusy) return;
      const history = [...messages, { id: id(), role: "user" as const, content: clean }];
      setMessages(history);
      setChatBusy(true);

      const lastSuggested = [...messages].reverse().find((m) => m.suggestedTask)?.suggestedTask;
      const wantsHandoff = HANDOFF.test(clean) || AFFIRM.test(clean);
      if (wantsHandoff && lastSuggested && !pipeline.running) {
        setChatBusy(false);
        await runPipeline(lastSuggested);
        return;
      }

      const model = await ensureModel("chat", false);
      const cfg = providerRef.current;
      if (!model) {
        setChatBusy(false);
        say({
          role: "assistant",
          agent: "مدير المشروع",
          content: "ما قدرتش نجاوب دابا: الذكاء الاصطناعي ماشي متاح. عاود جرّب بعد شوية، لا زيد مفتاح ديالك ف«الإعدادات».",
        });
        return;
      }
      const a = step("مدير المشروع", "يجاوب على سؤالك", model);
      try {
        const res = await chatFn({
          data: {
            messages: history.map((m) => ({ role: m.role, content: m.content })).slice(-20),
            language: "ar" as const,
            context: {
              repository: repoResult?.ok
                ? (repoResult.repository?.fullName ?? "")
                : repoConfig.repoUrl,
              branch: repoConfig.branch,
              commitSha: audit?.commitSha ?? "",
              stack: audit
                ? [
                    audit.stack.frontend.value,
                    audit.stack.backend.value,
                    audit.stack.database.value,
                    audit.stack.deployment.value,
                  ].filter((v) => v && v !== "UNKNOWN")
                : [],
              entryPoints: audit ? audit.entryPoints.map((e) => e.path).slice(0, 10) : [],
              apiRoutes: audit?.apiMap.length ?? 0,
              fileCount: audit?.counts.totalFiles ?? 0,
              planSummary: plan ? `${plan.summary} (${plan.steps.length} steps)` : "",
              changeSetSummary: changeSet
                ? `${changeSet.totals.files} files, +${changeSet.totals.additions}/-${changeSet.totals.deletions}`
                : "",
              reviewGate: review?.gate ?? "",
            },
            primaryProvider: cfg.primaryProvider,
            primaryModel: model,
            backupModels: rankModels(
              cfg.primaryProvider,
              providerStatusRef.current[cfg.primaryProvider]?.models ?? [],
              "chat",
            )
              .filter((p) => p.model !== model)
              .slice(0, 3)
              .map((p) => p.model),
            fallbackProvider: cfg.fallbackProvider,
            fallbackModel: cfg.fallbackModel,
            secrets: getUserSecrets(),
          },
        });
        if (!res.ok || !res.turn) {
          if (
            res.attempts.some(
              (attempt) =>
                attempt.model === model &&
                /توقف عند Google|no longer available/i.test(attempt.detail),
            )
          ) {
            forgetUnavailableModel(cfg.primaryProvider, model);
            setProviderConfig((current) => ({ ...current, primaryModel: "" }));
          }
          a.fail(arabize(res.error ?? ""));
          say({
            role: "assistant",
            agent: "مدير المشروع",
            content: `ما قدرتش نجاوب دابا: ${arabize(res.error ?? "مشكل فالمزوّد.")}`,
          });
          return;
        }
        const turn = res.turn;
        a.ok(undefined, turn.model);
        say({
          role: "assistant",
          agent: "مدير المشروع",
          model: turn.model,
          content: turn.reply,
          questions: turn.questions,
          suggestedTask: turn.suggestedTask,
          nextStep: turn.nextStep,
        });
        if (wantsHandoff && turn.suggestedTask && !pipeline.running) {
          await runPipeline(turn.suggestedTask);
        }
      } catch {
        a.fail("انقطاع فالاتصال");
        say({
          role: "assistant",
          agent: "مدير المشروع",
          content: "وقع انقطاع فالاتصال. عاود جرّب من فضلك.",
        });
      } finally {
        setChatBusy(false);
      }
    },
    [
      audit,
      changeSet,
      chatBusy,
      chatFn,
      ensureModel,
      messages,
      pipeline.running,
      plan,
      repoConfig.branch,
      repoConfig.repoUrl,
      repoResult,
      review,
      runPipeline,
    ],
  );

  const value = useMemo<Ctx>(
    () => ({
      repoConfig,
      setRepoConfig,
      providerConfig,
      setProviderConfig,
      repoResult,
      setRepoResult: (r) => {
        setRepoResult(r);
        setAudit(null);
        setPlan(null);
        setChangeSet(null);
        setReview(null);
        setGitResult(null);
      },
      audit,
      setAudit,
      plan,
      changeSet,
      review,
      gitResult,
      providerStatuses,
      setProviderStatus,
      keyStatus,
      serverSecrets,
      refreshSecrets,
      settingsOpen,
      setSettingsOpen,
      messages,
      chatBusy,
      sendMessage,
      clearChat: () => setMessages([]),
      pipeline,
      runPipeline,
      recoveredState,
      bootstrapState,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      repoConfig,
      providerConfig,
      repoResult,
      audit,
      plan,
      changeSet,
      review,
      gitResult,
      providerStatuses,
      keyStatus.github,
      keyStatus.gemini,
      keyStatus.openrouter,
      keyStatus.lovable,
      serverSecrets,
      settingsOpen,
      messages,
      chatBusy,
      pipeline,
      sendMessage,
      runPipeline,
      recoveredState,
      bootstrapState,
      refreshSecrets,
      setProviderStatus,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
