import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const destination = "dist/server/wrangler.json";
const roots = [".output", "dist"];
const preferred = [
  ".output/server/wrangler.json",
  "dist/server/wrangler.json",
];

function findConfig(directory) {
  if (!existsSync(directory)) return null;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isFile() && entry === "wrangler.json") return path;
    if (info.isDirectory()) {
      const found = findConfig(path);
      if (found) return found;
    }
  }
  return null;
}

const source = preferred.find(existsSync) ?? roots.map(findConfig).find(Boolean);
if (!source) {
  console.error("No generated wrangler.json found after the production build.");
  console.error("Checked .output and dist.");
  process.exit(1);
}

if (source !== destination) {
  mkdirSync("dist/server", { recursive: true });
  copyFileSync(source, destination);
}

console.log("Prepared " + destination + " from " + source + ".");
