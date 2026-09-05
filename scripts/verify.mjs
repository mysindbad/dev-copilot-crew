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

for (const step of commands) {
  console.log("\n==> " + step.label);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(step.label + " could not start: " + result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nVerification passed (" + commands.map(({ label }) => label).join(", ") + ").");
