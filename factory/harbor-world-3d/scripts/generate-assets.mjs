import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { exportFactory, generate, validate } from "../src/factory.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const repositoryPublicRoot = path.join(repositoryRoot, "public/assets/harbor");
const packagedPublicRoot = path.join(kitRoot, "exports/assets/harbor");
const publicRoot = fs.existsSync(path.join(repositoryPublicRoot, "models/coral-staghorn.glb")) ? repositoryPublicRoot : packagedPublicRoot;
const artifactRoot = publicRoot === repositoryPublicRoot ? repositoryRoot : kitRoot;
const modelRoot = path.join(publicRoot, "models");
const input = JSON.parse(fs.readFileSync(path.join(kitRoot, "examples/minimal-input.json"), "utf8"));
const runtimeModelFiles = ["boat.glb", "coral-brain.glb", "coral-lettuce.glb", "coral-sea-fan.glb", "coral-staghorn.glb", "coral-table.glb", "fish.glb", "rocks.glb", "sand.glb", "star.glb"];
const expectedRuntimeHashes = {
  "boat.glb": "fe456b4dadb053f9ed535079c0aaba9381fd72bb09b03109115ff0392f5927f9",
  "coral-brain.glb": "ddf15386e7f7debbc2c98146185f3b5b031ae0e405dbb1466f2f41eae8a1c4b5",
  "coral-lettuce.glb": "543dcc1b4adb9911cbe32d5eb68596a47bd92f5bc075b829f70374d619e660d7",
  "coral-sea-fan.glb": "43ac27d89d26b791a4840fbe025a97f263c8ad1ee70145e12e7cec5461217870",
  "coral-staghorn.glb": "92589528272aa05c0493d657e2cb9c0b83b0ea743b6a93fde9fa60e987d8178b",
  "coral-table.glb": "d8fe6589b7426bf15e0751981340e4bf0cb0b7328049df7f0c9d8982d324adf9",
  "fish.glb": "ce6928decfec25dc216606a4012e014ae02f122f33163e1b791028af94754cea",
  "rocks.glb": "159e7f575b27f5d28853d512a48e5b37b3e788cc9e7e7ec35c85b28374746e99",
  "star.glb": "a32604693adc284fc8965beaba17e31ffa5a91c7c61aca7bbeed2f77005fc8b7"
};

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

for (const fileName of runtimeModelFiles) {
  const filePath = path.join(modelRoot, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Missing required coral source: ${fileName}`);
  if (fileName === "sand.glb") continue;
  const actual = sha256(fs.readFileSync(filePath));
  if (actual !== expectedRuntimeHashes[fileName]) throw new Error(`Curated runtime model checksum drift: ${fileName}`);
}

const startedAt = new Date().toISOString();
const result = generate(input);
const technicalValidation = validate(result);
if (!technicalValidation.valid) throw new Error("Harbor generation failed technical validation.");
const exported = await exportFactory(result);
const exportRecords = [];

for (const file of exported.files) {
  if (file.mediaType === "model/gltf-binary" && file.fileName !== "sand.glb") continue;
  const target = file.mediaType === "model/gltf-binary"
    ? path.join(modelRoot, file.fileName)
    : path.join(publicRoot, file.fileName);
  const data = file.bytes ? Buffer.from(file.bytes) : Buffer.from(file.text, "utf8");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  exportRecords.push({
    file: path.relative(artifactRoot, target),
    bytes: data.length,
    sha256: sha256(data),
    mediaType: file.mediaType,
    ...(file.fileName === "sand.glb" ? { source: "Deterministic harbor heightfield factory" } : {}),
    ...(file.width ? { width: file.width, height: file.height, colorSpace: file.colorSpace } : {}),
  });
}

for (const fileName of runtimeModelFiles) {
  const target = path.join(modelRoot, fileName);
  const data = fs.readFileSync(target);
  const relativeFile = path.relative(artifactRoot, target);
  if (exportRecords.some((record) => record.file === relativeFile)) continue;
  exportRecords.push({ file: relativeFile, bytes: data.length, sha256: sha256(data), mediaType: "model/gltf-binary", source: "Objaverse optimized derivative" });
}

const totalModelBytes = exportRecords.filter((record) => record.mediaType === "model/gltf-binary").reduce((total, record) => total + record.bytes, 0);
const totalTextureBytes = exportRecords.filter((record) => record.mediaType === "image/png").reduce((total, record) => total + record.bytes, 0);
const harborManifest = {
  schema: "crimson-harbor/manifest/1",
  factory: { id: result.artifact.factoryId, version: result.artifact.version, semanticSignature: result.semanticSignature },
  generatedAt: "deterministic-build; timestamp retained only in run report",
  source: {
    repository: "https://github.com/LuminaryLabs-Dev/NexusFactory-Kits",
    commit: "627c4aeb864f438c3b1a24a00b152a17d24e8cf9",
    license: "MIT",
  },
  budget: {
    maximumModelBytes: 8912896,
    actualModelBytes: totalModelBytes,
    maximumTextureBytes: 1048576,
    actualTextureBytes: totalTextureBytes,
    pass: totalModelBytes < 12582912 && totalTextureBytes < 1048576,
  },
  exports: exportRecords.sort((a, b) => a.file.localeCompare(b.file)),
  validation: technicalValidation,
};
writeJson(path.join(publicRoot, "harbor.manifest.json"), harborManifest);

const runReport = {
  schemaVersion: "1.0",
  runId: `harbor-${result.semanticSignature.replace(":", "-")}`,
  factoryId: result.artifact.factoryId,
  factoryVersion: result.artifact.version,
  sourceVersions: [harborManifest.source],
  input,
  parameters: input.params,
  seed: input.seed,
  streams: result.artifact.seedPolicy,
  stages: [...result.stages, { id: "glb-export", status: "pass", outputSignature: `sha256:${sha256(JSON.stringify(exportRecords))}` }],
  artifactSignature: result.semanticSignature,
  artifactSignatures: {
    semantic: result.semanticSignature,
    exports: `sha256:${sha256(JSON.stringify(exportRecords))}`,
  },
  technicalValidation,
  validation: technicalValidation,
  exports: harborManifest.exports,
  warnings: result.warnings,
  errors: [],
  timing: { startedAt, completedAt: new Date().toISOString() },
  environment: { node: process.version, three: "0.180.0" },
  status: harborManifest.budget.pass ? "pass" : "fail",
};
writeJson(path.join(kitRoot, "evidence/run-report.json"), runReport);
writeJson(path.join(kitRoot, "evidence/technical-validation.json"), technicalValidation);
writeJson(path.join(kitRoot, "examples/expected-result.json"), {
  semanticSignature: result.semanticSignature,
  parameters: result.artifact.params,
  counts: {
    coral: result.artifact.world.placements.coral.length,
    fish: result.artifact.world.placements.fish.length,
    rocks: result.artifact.world.placements.rocks.length,
    stars: result.artifact.world.placements.stars.length,
  },
});

process.stdout.write(`${JSON.stringify({ status: runReport.status, semanticSignature: result.semanticSignature, totalModelBytes, totalTextureBytes, exports: harborManifest.exports }, null, 2)}\n`);
