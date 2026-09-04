import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const sourceAssets = path.join(repositoryRoot, "public/assets/harbor");
const exportedAssets = path.join(kitRoot, "exports/assets/harbor");
const reportsRoot = path.join(kitRoot, "reports");

fs.mkdirSync(path.dirname(exportedAssets), { recursive: true });
fs.rmSync(exportedAssets, { recursive: true, force: true });
fs.cpSync(sourceAssets, exportedAssets, { recursive: true });
fs.mkdirSync(reportsRoot, { recursive: true });

const cleanParent = fs.mkdtempSync(path.join(os.tmpdir(), "crimson-harbor-kit-"));
const cleanRoot = path.join(cleanParent, "kit");
fs.cpSync(kitRoot, cleanRoot, { recursive: true });

const commands = [
  ["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]],
  ["npm", ["test"]],
  ["npm", ["run", "generate"]],
  ["npm", ["run", "validate"]],
];
const results = [];

for (const [command, args] of commands) {
  const run = spawnSync(command, args, { cwd: cleanRoot, encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 });
  results.push({
    command: [command, ...args].join(" "),
    status: run.status === 0 ? "pass" : "fail",
    exitCode: run.status,
    stdoutTail: (run.stdout || "").trim().slice(-1200),
    stderrTail: (run.stderr || "").trim().slice(-1200),
  });
  if (run.status !== 0) break;
}

const cleanRoom = {
  schemaVersion: "1.0",
  status: results.length === commands.length && results.every((entry) => entry.status === "pass") ? "pass" : "fail",
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  isolation: "Fresh task-local directory with dependencies installed from package-lock.json",
  commands: results,
  gpuValidation: "Not repeated in clean room; native framebuffer evidence is stored under evidence/.",
};
fs.writeFileSync(path.join(reportsRoot, "clean-room.json"), `${JSON.stringify(cleanRoom, null, 2)}\n`);
fs.rmSync(cleanParent, { recursive: true, force: true });

const excluded = new Set(["reports/inventory.json", "reports/package-validation.json"]);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(kitRoot, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) walk(absolute);
    else if (!excluded.has(relative)) {
      const bytes = fs.readFileSync(absolute);
      files.push({ path: relative, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
walk(kitRoot);
files.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(path.join(reportsRoot, "inventory.json"), `${JSON.stringify({ schemaVersion: "1.0", files, excluded: [...excluded] }, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ status: cleanRoom.status, exportedAssets, inventoryFiles: files.length }, null, 2)}\n`);
if (cleanRoom.status !== "pass") process.exitCode = 1;
