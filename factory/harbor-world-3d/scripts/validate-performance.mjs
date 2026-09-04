import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGltfFromFile } from "@headless-three/renderer";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const publicRoot = path.join(repositoryRoot, "public/assets/harbor");
const world = JSON.parse(fs.readFileSync(path.join(publicRoot, "world.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "harbor.manifest.json"), "utf8"));
const modelNames = [...new Set([
  world.boat.asset,
  world.seabed.asset,
  "rocks.glb",
  "fish.glb",
  "star.glb",
  ...world.placements.coral.map(({ asset }) => asset),
])];

const metrics = {};
for (const fileName of modelNames) {
  const loaded = await loadGltfFromFile(path.join(publicRoot, "models", fileName));
  let meshes = 0;
  let triangles = 0;
  loaded.scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  });
  metrics[fileName] = { meshes, triangles };
}

const budgets = {
  high: { triangles: 1_300_000, drawCalls: 45 },
  auto: { triangles: 950_000, drawCalls: 38 },
  low: { triangles: 600_000, drawCalls: 26 },
};
const tiers = {};
for (const [tier, counts] of Object.entries(world.qualityCounts)) {
  const coral = world.placements.coral.slice(0, counts.coral);
  const coralByAsset = [...new Set(coral.map(({ asset }) => asset))];
  const coralTriangles = coral.reduce((total, { asset }) => total + metrics[asset].triangles, 0);
  const individualRocks = counts.rocks * 4;
  const visibleTriangles = metrics[world.seabed.asset].triangles
    + 96
    + individualRocks * metrics["rocks.glb"].triangles
    + counts.fish * metrics["fish.glb"].triangles
    + counts.stars * metrics["star.glb"].triangles
    + metrics[world.boat.asset].triangles
    + 2
    + coralTriangles;
  const instancedAssetCalls = metrics["rocks.glb"].meshes
    + metrics["fish.glb"].meshes
    + coralByAsset.reduce((total, asset) => total + metrics[asset].meshes, 0);
  const underwaterCalls = metrics[world.seabed.asset].meshes + 1 + instancedAssetCalls + counts.stars + metrics[world.boat.asset].meshes;
  const shadowCalls = tier === "low" ? 0 : instancedAssetCalls + counts.stars + metrics[world.boat.asset].meshes;
  const surfaceCalls = metrics[world.boat.asset].meshes + 1;
  const drawCalls = underwaterCalls + shadowCalls + surfaceCalls;
  tiers[tier] = {
    logicalRockClusters: counts.rocks,
    individualRocks,
    coral: counts.coral,
    fish: counts.fish,
    stars: counts.stars,
    visibleTriangles,
    drawCalls,
    budget: budgets[tier],
    pass: visibleTriangles <= budgets[tier].triangles && drawCalls <= budgets[tier].drawCalls,
  };
}

const checks = [
  { id: "all-quality-tiers", pass: Object.values(tiers).every(({ pass }) => pass) },
  { id: "static-model-payload", pass: manifest.budget.actualModelBytes <= manifest.budget.maximumModelBytes, observed: manifest.budget.actualModelBytes, maximum: manifest.budget.maximumModelBytes },
  { id: "static-texture-payload", pass: manifest.budget.actualTextureBytes <= manifest.budget.maximumTextureBytes, observed: manifest.budget.actualTextureBytes, maximum: manifest.budget.maximumTextureBytes },
  { id: "single-instanced-rock-batch", pass: metrics["rocks.glb"].meshes === 1 },
];
const report = {
  schema: "crimson-harbor/performance-validation/1",
  status: checks.every(({ pass }) => pass) ? "pass" : "fail",
  method: "Static inspection of the exact production GLBs, serialized quality prefixes, and renderer pass topology. Browser timing is environment-dependent and is not inferred from software-render duration.",
  metrics,
  tiers,
  checks,
};
fs.writeFileSync(path.join(kitRoot, "evidence/performance-validation.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
