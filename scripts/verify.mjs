import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  { args: ["test"], label: "Pruebas automáticas" },
  { args: ["run", "typecheck"], label: "TypeScript" },
  { args: ["run", "lint"], label: "ESLint" },
  { args: ["run", "build"], label: "Build de producción" },
];

for (const step of steps) {
  console.log(`\n### ${step.label}`);
  const result = spawnSync(npm, step.args, { stdio: "inherit", shell: false });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nVerificación completa: tests, TypeScript, ESLint y build pasaron.");
