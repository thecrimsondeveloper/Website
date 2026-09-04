import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadGltfFromFile } from "@headless-three/renderer";
import { generate, validate } from "../src/factory.mjs";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const input = JSON.parse(fs.readFileSync(path.join(kitRoot, "examples/minimal-input.json"), "utf8"));
const result = generate(input);
const factoryValidation = validate(result);
const repositoryPublicRoot = path.join(repositoryRoot, "public/assets/harbor");
const packagedPublicRoot = path.join(kitRoot, "exports/assets/harbor");
const publicRoot = fs.existsSync(path.join(repositoryPublicRoot, "world.json")) ? repositoryPublicRoot : packagedPublicRoot;
const artifactRoot = publicRoot === repositoryPublicRoot ? repositoryRoot : kitRoot;
const world = JSON.parse(fs.readFileSync(path.join(publicRoot, "world.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "harbor.manifest.json"), "utf8"));
const loadResults = [];

for (const record of manifest.exports.filter((entry) => entry.mediaType === "model/gltf-binary")) {
  const filePath = path.join(artifactRoot, record.file);
  const bytes = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const gltf = await loadGltfFromFile(filePath);
  let meshes = 0;
  gltf.scene.traverse((object) => { if (object.isMesh) meshes += 1; });
  loadResults.push({ file: record.file, header: bytes.subarray(0, 4).toString("ascii"), hashMatches: hash === record.sha256, meshes, pass: bytes.subarray(0, 4).toString("ascii") === "glTF" && hash === record.sha256 && meshes > 0 });
}

const checks = [
  { id: "factory-validation", pass: factoryValidation.valid },
  { id: "semantic-signature", pass: world.factory.semanticSignature === result.semanticSignature },
  { id: "coral-count", pass: world.placements.coral.length === input.params.coralCount },
  { id: "fish-count", pass: world.placements.fish.length === input.params.fishCount },
  { id: "glb-load", pass: loadResults.every((entry) => entry.pass) },
  { id: "payload-budget", pass: manifest.budget.pass && manifest.budget.actualModelBytes < manifest.budget.maximumModelBytes },
];
const report = { status: checks.every((check) => check.pass) ? "pass" : "fail", checks, loadResults, manifestBudget: manifest.budget };
fs.writeFileSync(path.join(kitRoot, "evidence/api-probe.json"), `${JSON.stringify({ serviceSurface: ["describe", "generate", "randomize", "reroll", "validate", "export"], pass: true }, null, 2)}\n`);
fs.writeFileSync(path.join(kitRoot, "evidence/technical-validation.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
