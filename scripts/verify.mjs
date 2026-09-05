import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const commands = [
  { label: "lint", command: "bun", args: ["run", "lint"] },
  { label: "typecheck", command: "bunx", args: ["tsc", "--noEmit"] },
];

if (packageJson.scripts?.test) {
  commands.push({ label: "test", command: "bun", args: ["run", "test"] });
}

async function report(label, state, details) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (!token || !repository || !sha) return;
  await fetch("https://api.github.com/repos/" + repository + "/statuses/" + sha, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state,
      context: "verification/" + label,
      description: details.slice(0, 140) || (state === "success" ? "Passed" : "Failed"),
    }),
  }).catch(() => undefined);
}

for (const step of commands) {
  console.log("\n==> " + step.label);
  const result = spawnSync(step.command, step.args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (output) console.log(output.slice(-12000));

  if (result.error || result.status !== 0) {
    const details = (result.error?.message || output || "Command failed")
      .replace(/\s+/g, " ")
      .trim();
    await report(step.label, "failure", details);
    process.exit(result.status ?? 1);
  }
  await report(step.label, "success", "Passed");
}

console.log("\nVerification passed (" + commands.map(({ label }) => label).join(", ") + ").");
