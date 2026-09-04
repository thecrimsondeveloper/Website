import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { loadGltfFromFile, render } from "@headless-three/renderer";
import { ThreeBackend, normalizeAsset } from "../src/components/shader-renderer/three-backend.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(repositoryRoot, "public/assets/harbor");
const evidenceRoot = path.join(repositoryRoot, "factory/harbor-world-3d/evidence/interaction");
const world = JSON.parse(fs.readFileSync(path.join(publicRoot, "world.json"), "utf8"));

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function headlessMaterialAdapter(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      for (const value of Object.values(material)) if (value?.isTexture && value.channel > 1) value.channel = 0;
    });
  });
}

async function loadAsset(fileName) {
  const loaded = await loadGltfFromFile(path.join(publicRoot, "models", fileName));
  const root = normalizeAsset(loaded.scene, fileName);
  headlessMaterialAdapter(root);
  return root;
}

function firstMesh(root) {
  root.updateMatrixWorld(true);
  let result;
  root.traverse((object) => {
    if (result || !object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    result = new THREE.Mesh(geometry, object.material);
  });
  if (!result) throw new Error("Star asset has no renderable mesh.");
  return result;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b4b4d);
scene.add(new THREE.HemisphereLight(0xdaf1e4, 0x294747, 2.5));
const sun = new THREE.DirectionalLight(0xffeed1, 3.2);
sun.position.set(-6, 12, 8);
scene.add(sun);

const sand = await loadAsset("sand.glb");
sand.position.y = world.seabed.y;
sand.scale.set(world.seabed.radius, 1, world.seabed.radius);
scene.add(sand);

const boat = await loadAsset("boat.glb");
boat.position.set(...world.boat.position);
boat.rotation.set(...world.boat.rotation);
boat.scale.setScalar(world.boat.scale);
scene.add(boat);

const starTemplate = firstMesh(await loadAsset("star.glb"));
const stars = world.placements.stars.map((record, index) => {
  const star = new THREE.Mesh(starTemplate.geometry, starTemplate.material);
  star.name = record.id;
  star.userData = { index, record, basePosition: [...record.position] };
  star.position.set(...record.position);
  star.rotation.set(...record.rotation);
  star.scale.setScalar(record.scale);
  scene.add(star);
  return star;
});

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(world.water.size, world.water.size),
  new THREE.MeshPhysicalMaterial({ color: 0x237579, transparent: true, opacity: 0.3, roughness: 0.22, depthWrite: false }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = world.water.y;
water.renderOrder = 5;
scene.add(water);

const fishingLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xf6e5b8, transparent: true, opacity: 0 }),
);
scene.add(fishingLine);

const camera = new THREE.PerspectiveCamera(world.camera.fov, 960 / 640, world.camera.near, world.camera.far);
camera.position.set(...world.camera.position);
camera.lookAt(...world.camera.target);
scene.updateMatrixWorld(true);
camera.updateMatrixWorld(true);

const backend = {
  stars,
  caught: new Set(),
  total: 0,
  raycaster: new THREE.Raycaster(),
  camera,
  boat,
  fishingLine,
  cast: null,
  clockStartedAt: performance.now(),
  resetTimer: 0,
  events: [],
  options: { onStarCaught: (detail) => backend.events.push(detail) },
};
backend.catchStar = ThreeBackend.prototype.catchStar;

fs.mkdirSync(evidenceRoot, { recursive: true });
const before = render(scene, camera, { width: 960, height: 640 });
fs.writeFileSync(path.join(evidenceRoot, "before.png"), before);

const requested = stars[0];
const projected = requested.getWorldPosition(new THREE.Vector3()).project(camera);
ThreeBackend.prototype.castAt.call(backend, (projected.x + 1) / 2, (projected.y + 1) / 2);
const selectedId = backend.cast?.star?.userData?.record?.id || null;
if (backend.cast) ThreeBackend.prototype.updateCast.call(backend, backend.cast.startedAt + 0.9);
scene.updateMatrixWorld(true);

const after = render(scene, camera, { width: 960, height: 640 });
fs.writeFileSync(path.join(evidenceRoot, "after.png"), after);
const passed = selectedId === requested.name && backend.caught.has(requested.name) && backend.total === 1 && backend.events.length === 1 && before.compare(after) !== 0;
const inputReport = {
  requestedId: requested.name,
  projectedNdc: [projected.x, projected.y],
  selectedId,
  hitCount: selectedId ? 1 : 0,
  action: "ThreeBackend.castAt -> ThreeBackend.catchStar -> ThreeBackend.updateCast",
  beforeState: { total: 0, caught: [] },
  afterState: { total: backend.total, caught: [...backend.caught], events: backend.events },
};
const validation = {
  verdict: passed ? "pass" : "fail",
  renderer: "@headless-three/renderer",
  adapter: process.env.VK_ICD_FILENAMES ? "task-local Mesa Lavapipe" : "system adapter",
  dimensions: [960, 640],
  beforeSha256: sha256(before),
  afterSha256: sha256(after),
  pixelStateChanged: before.compare(after) !== 0,
  importedProjectComponents: ["ThreeBackend.castAt", "ThreeBackend.catchStar", "ThreeBackend.updateCast", "normalizeAsset", "world.json", "boat.glb", "sand.glb", "star.glb"],
  stubs: ["MeshPhysicalMaterial water surrogate replaces browser-only GLSL during CPU rendering."],
  warnings: ["Browser pointer-event and DOM focus behavior are outside this headless Three.js boundary."],
  artifacts: {
    before: "factory/harbor-world-3d/evidence/interaction/before.png",
    inputReport: "factory/harbor-world-3d/evidence/interaction/input-report.json",
    after: "factory/harbor-world-3d/evidence/interaction/after.png",
  },
};
fs.writeFileSync(path.join(evidenceRoot, "input-report.json"), `${JSON.stringify(inputReport, null, 2)}\n`);
fs.writeFileSync(path.join(evidenceRoot, "validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ validation, inputReport }, null, 2)}\n`);
if (!passed) process.exitCode = 1;
