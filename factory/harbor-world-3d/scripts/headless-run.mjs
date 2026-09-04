import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { loadGltfFromFile, render } from "@headless-three/renderer";
import { buildAssetGroups, buildSurfaceTextures, generate } from "../src/factory.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const repositoryPublicRoot = path.join(repositoryRoot, "public/assets/harbor");
const packagedPublicRoot = path.join(kitRoot, "exports/assets/harbor");
const publicRoot = fs.existsSync(path.join(repositoryPublicRoot, "models/coral-staghorn.glb")) ? repositoryPublicRoot : packagedPublicRoot;
const input = JSON.parse(fs.readFileSync(path.join(kitRoot, "examples/minimal-input.json"), "utf8"));
const result = generate(input);
const { world } = result.artifact;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b4b4d);
scene.add(new THREE.HemisphereLight(0xdaf1e4, 0x294747, 2.5));
const sun = new THREE.DirectionalLight(0xffeed1, 3.2);
sun.position.set(-6, 12, 8);
scene.add(sun);

const assets = buildAssetGroups();
const textureData = new Map(buildSurfaceTextures().map((texture) => [texture.fileName, texture]));
function dataTexture(fileName, repeat) {
  const source = textureData.get(`textures/${fileName}`);
  const texture = new THREE.DataTexture(source.rgba, source.width, source.height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  if (source.colorSpace === "srgb") texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const rockAlbedo = dataTexture("rock-albedo.png", [2, 1.5]);
const rockNormal = dataTexture("rock-normal.png", [2, 1.5]);
const sandAlbedo = dataTexture("sand-albedo.png", [5, 5]);
const sandNormal = dataTexture("sand-normal.png", [5, 5]);
assets.rocks.traverse((object) => {
  if (!object.isMesh) return;
  object.material.map = rockAlbedo;
  object.material.normalMap = rockNormal;
  object.material.normalScale = new THREE.Vector2(0.62, 0.62);
  object.material.needsUpdate = true;
});
assets.sand.traverse((object) => {
  if (!object.isMesh) return;
  object.material.map = sandAlbedo;
  object.material.normalMap = sandNormal;
  object.material.normalScale = new THREE.Vector2(0.34, 0.34);
  object.material.needsUpdate = true;
});

assets.sand.position.y = world.seabed.y;
assets.sand.scale.set(world.seabed.radius, 1, world.seabed.radius);
scene.add(assets.sand);

assets.boat.position.set(...world.boat.position);
assets.boat.rotation.set(...world.boat.rotation);
assets.boat.scale.setScalar(world.boat.scale);
scene.add(assets.boat);

for (const placement of world.placements.fish) {
  const fish = assets.fish.clone(true);
  fish.position.set(...placement.position);
  fish.rotation.set(...placement.rotation);
  fish.scale.setScalar(placement.scale);
  scene.add(fish);
}

for (const placement of world.placements.rocks) {
  const rocks = assets.rocks.clone(true);
  rocks.position.set(...placement.position);
  rocks.rotation.set(...placement.rotation);
  rocks.scale.setScalar(placement.scale);
  scene.add(rocks);
}

for (const placement of world.placements.stars) {
  const star = assets.star.clone(true);
  star.position.set(...placement.position);
  star.rotation.set(...placement.rotation);
  star.scale.setScalar(placement.scale);
  scene.add(star);
}

const coralCache = new Map();
for (const placement of world.placements.coral) {
  if (!coralCache.has(placement.asset)) {
    const loaded = await loadGltfFromFile(path.join(publicRoot, "models", placement.asset));
    coralCache.set(placement.asset, loaded.scene);
  }
  const coral = coralCache.get(placement.asset).clone(true);
  coral.position.set(...placement.position);
  coral.rotation.set(...placement.rotation);
  coral.scale.setScalar(placement.scale);
  scene.add(coral);
}

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(world.water.size, world.water.size),
  new THREE.MeshPhysicalMaterial({ color: 0x237579, transparent: true, opacity: 0.32, roughness: 0.23, metalness: 0, transmission: 0.04, depthWrite: false }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = world.water.y;
water.renderOrder = 5;
scene.add(water);

const camera = new THREE.PerspectiveCamera(world.camera.fov, 960 / 640, world.camera.near, world.camera.far);
camera.position.set(...world.camera.position);
camera.lookAt(...world.camera.target);
scene.updateMatrixWorld(true);
camera.updateMatrixWorld(true);

const options = { width: 960, height: 640 };
const first = render(scene, camera, options);
const second = render(scene, camera, options);
const firstHash = crypto.createHash("sha256").update(first).digest("hex");
const secondHash = crypto.createHash("sha256").update(second).digest("hex");
const imagePath = path.join(kitRoot, "evidence/headless-harbor.png");
fs.writeFileSync(imagePath, first);

const validation = {
  status: firstHash === secondHash && first.length > 1000 ? "pass" : "fail",
  renderer: "@headless-three/renderer",
  adapter: process.env.VK_ICD_FILENAMES ? "task-local Mesa Lavapipe" : "system adapter",
  dimensions: [options.width, options.height],
  bytes: first.length,
  firstHash,
  secondHash,
  deterministic: firstHash === secondHash,
  coverage: "Three.js scene geometry, 256px rock and sand textures, normal mapping, GLB loading, camera, lighting, depth, transparent water material, and deterministic framebuffer. Exact browser-only GLSL execution remains a separate validation surface.",
  image: path.relative(repositoryRoot, imagePath),
};
fs.writeFileSync(path.join(kitRoot, "evidence/headless-validation.json"), `${JSON.stringify(validation, null, 2)}\n`);

const runReportPath = path.join(kitRoot, "evidence/run-report.json");
if (fs.existsSync(runReportPath)) {
  const report = JSON.parse(fs.readFileSync(runReportPath, "utf8"));
  report.visualCapture = validation;
  report.status = report.status === "pass" && validation.status === "pass" ? "pass" : "fail";
  fs.writeFileSync(runReportPath, `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
if (validation.status !== "pass") process.exitCode = 1;
