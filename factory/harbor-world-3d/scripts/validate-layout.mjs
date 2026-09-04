import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssetGroups, buildSurfaceTextures, generate, stableStringify } from "../src/factory.mjs";
import { heightAt } from "../src/terrain.mjs";
import { expandRockClusters } from "../../../src/components/shader-renderer/three-backend.js";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const input = JSON.parse(fs.readFileSync(path.join(kitRoot, "examples/minimal-input.json"), "utf8"));
const runId = "harbor-density-20260904-604a";
const runRoot = path.join(kitRoot, "evidence/density-review", runId);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function geometryTriangles(root) {
  let total = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute("position");
    total += object.geometry.index ? object.geometry.index.count / 3 : position.count / 3;
  });
  return total;
}

function mutatedIds(before, after) {
  const beforeRecords = new Map(Object.values(before.placements).flat().map((record) => [record.id, stableStringify(record)]));
  const afterRecords = new Map(Object.values(after.placements).flat().map((record) => [record.id, stableStringify(record)]));
  const ids = new Set([...beforeRecords.keys(), ...afterRecords.keys()]);
  return [...ids].filter((id) => beforeRecords.get(id) !== afterRecords.get(id)).sort();
}

const baselineWorld = JSON.parse(fs.readFileSync(path.join(runRoot, "baseline/world.json"), "utf8"));
const baseParams = { worldRadius: input.params.worldRadius, waterClarity: input.params.waterClarity };
const stages = [
  { id: "a0001", concern: "heightfield-and-curves", params: { ...baseParams, rockClusterCount: 3, coralCount: 13, fishCount: 8, starCount: 3 } },
  { id: "a0002", concern: "rock-density", params: { ...baseParams, rockClusterCount: 48, coralCount: 13, fishCount: 8, starCount: 3 } },
  { id: "a0003", concern: "coral-density", params: { ...baseParams, rockClusterCount: 48, coralCount: 42, fishCount: 8, starCount: 3 } },
  { id: "a0004", concern: "fish-routes", params: { ...baseParams, rockClusterCount: 48, coralCount: 42, fishCount: 18, starCount: 3 } },
  { id: "a0005", concern: "star-fishing-density", params: input.params },
];

let incumbent = baselineWorld;
const attempts = [];
for (const stage of stages) {
  const generated = generate({ seed: input.seed, params: stage.params });
  const candidate = generated.artifact.world;
  const mutations = mutatedIds(incumbent, candidate);
  attempts.push({
    attemptId: `${runId}-${stage.id}`,
    candidateId: `${runId}-${stage.id}-c01`,
    concern: stage.concern,
    mutationCount: mutations.length,
    mutationIds: mutations,
    underItemCap: mutations.length <= 50,
    encodingSha256: sha256(stableStringify({ seed: input.seed, params: stage.params, version: generated.artifact.version })),
    semanticSignature: generated.semanticSignature,
  });
  incumbent = candidate;
}

const result = generate(input);
const world = result.artifact.world;
const terrainSamples = [];
for (let row = 0; row <= 64; row += 1) {
  for (let column = 0; column <= 64; column += 1) {
    const x = (column / 64 * 2 - 1) * world.terrain.radius;
    const z = (row / 64 * 2 - 1) * world.terrain.radius;
    terrainSamples.push(heightAt(world.terrain, x, z));
  }
}

function spacingPass(records, requiredDistance) {
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const a = records[left];
      const b = records[right];
      const distance = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
      if (distance + 1e-6 < requiredDistance(a, b)) return false;
    }
  }
  return true;
}

const assets = buildAssetGroups(world.terrain);
const textureRecords = buildSurfaceTextures(world.terrain);
const individualRocks = expandRockClusters(world.placements.rocks);
const performanceReport = JSON.parse(fs.readFileSync(path.join(kitRoot, "evidence/performance-validation.json"), "utf8"));
const meshReport = JSON.parse(fs.readFileSync(path.join(kitRoot, "evidence/rock-mesh-integrity.json"), "utf8"));
const interactionReport = JSON.parse(fs.readFileSync(path.join(kitRoot, "evidence/interaction/validation.json"), "utf8"));
const checks = [
  { id: "target-counts", pass: world.placements.rocks.length === 48 && world.placements.coral.length === 42 && world.placements.fish.length === 18 && world.placements.stars.length === 6 },
  { id: "individual-rock-count", pass: individualRocks.length === 192 && new Set(individualRocks.map(({ id }) => id)).size === 192, observed: individualRocks.length },
  { id: "curve-counts", pass: world.curves.rock.length === 3 && world.curves.coral.length === 4 && world.curves.fish.length === 3 },
  { id: "terrain-bounds", pass: Math.min(...terrainSamples) >= world.terrain.minimumY && Math.max(...terrainSamples) <= world.terrain.maximumY && Math.max(...terrainSamples) <= world.water.y - 0.35, observed: [Math.min(...terrainSamples), Math.max(...terrainSamples)] },
  { id: "terrain-triangles", pass: geometryTriangles(assets.sand) === 32768, observed: geometryTriangles(assets.sand) },
  { id: "terrain-textures", pass: textureRecords.length === 6 && textureRecords.every(({ width, height }) => width === 256 && height === 256), observed: textureRecords.map(({ fileName }) => fileName) },
  { id: "rock-spacing", pass: spacingPass(world.placements.rocks, (a, b) => (a.scale + b.scale) * 0.78 + 0.12) },
  { id: "coral-spacing", pass: spacingPass(world.placements.coral, (a, b) => (a.scale + b.scale) * 0.82 + 0.18) },
  { id: "boat-clearance", pass: [...world.placements.rocks, ...world.placements.coral].every(({ position }) => Math.hypot(position[0], position[2]) >= 3.4) },
  { id: "fish-clearance", pass: world.placements.fish.every(({ position }) => position[1] >= heightAt(world.terrain, position[0], position[2]) + 0.28 && position[1] <= world.water.y - 0.18) },
  { id: "quality-prefix-counts", pass: world.qualityCounts.high.rocks === 48 && world.qualityCounts.auto.rocks === 34 && world.qualityCounts.low.rocks === 20 },
  { id: "performance-budgets", pass: performanceReport.status === "pass", observed: performanceReport.tiers },
  { id: "rock-mesh-integrity", pass: meshReport.verdict === "pass" },
  { id: "star-fishing-interaction", pass: interactionReport.verdict === "pass" },
  { id: "review-mutation-cap", pass: attempts.every(({ underItemCap }) => underItemCap), observed: attempts.map(({ attemptId, mutationCount }) => ({ attemptId, mutationCount })) },
];

const report = {
  schema: "crimson-harbor/layout-validation/1",
  runId,
  revision: "working-tree-before-final-commit",
  seed: input.seed,
  semanticSignature: result.semanticSignature,
  attempts,
  checks,
  verdict: checks.every(({ pass }) => pass) ? "pass" : "fail",
};
writeJson(path.join(runRoot, "technical-gates.json"), report);
writeJson(path.join(runRoot, "attempts/index.json"), { runId, attempts });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.verdict !== "pass") process.exitCode = 1;
