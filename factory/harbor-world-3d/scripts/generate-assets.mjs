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
const coralFiles = ["coral-staghorn.glb", "coral-brain.glb", "coral-lettuce.glb", "coral-sea-fan.glb", "coral-table.glb"];
const expectedCoralHashes = {
  "coral-staghorn.glb": "dcdd988f5c84abde4bce4c17d7fdba94c901ab6b4f1978b332e3d9aabee6091a",
  "coral-brain.glb": "e1a3483d975ec566ce733ba06a93367898f117ab22ff827aade628f36ca00ab6",
  "coral-lettuce.glb": "673971a0e7f7e76f451d4a7e06a1ceb76fd17919c26778f49089f8620bcc3abc",
  "coral-sea-fan.glb": "a2c849ae2567047e6fa7aed42233015081c4e3d867da389d036083c3aff86ef7",
  "coral-table.glb": "c2b2b515843eb2110d70c37ba3e1ba945f8090ed08f80a024d81403f4e78fb1e"
};

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

for (const fileName of coralFiles) {
  const filePath = path.join(modelRoot, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Missing required coral source: ${fileName}`);
  const actual = sha256(fs.readFileSync(filePath));
  if (actual !== expectedCoralHashes[fileName]) throw new Error(`Coral source checksum drift: ${fileName}`);
}

const startedAt = new Date().toISOString();
const result = generate(input);
const technicalValidation = validate(result);
if (!technicalValidation.valid) throw new Error("Harbor generation failed technical validation.");
const exported = await exportFactory(result);
const exportRecords = [];

for (const file of exported.files) {
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
    ...(file.width ? { width: file.width, height: file.height, colorSpace: file.colorSpace } : {}),
  });
}

for (const fileName of coralFiles) {
  const target = path.join(modelRoot, fileName);
  const data = fs.readFileSync(target);
  exportRecords.push({ file: path.relative(artifactRoot, target), bytes: data.length, sha256: sha256(data), mediaType: "model/gltf-binary", source: "NexusFactory-Kits" });
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
    maximumModelBytes: 5242880,
    actualModelBytes: totalModelBytes,
    maximumTextureBytes: 1048576,
    actualTextureBytes: totalTextureBytes,
    pass: totalModelBytes < 5242880 && totalTextureBytes < 1048576,
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
