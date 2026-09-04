import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { loadGltfFromFile, render } from "@headless-three/renderer";
import sharp from "sharp";
import { generate } from "../src/factory.mjs";
import { expandRockClusters, instantiateAsset, normalizeAsset } from "../../../src/components/shader-renderer/three-backend.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const repositoryPublicRoot = path.join(repositoryRoot, "public/assets/harbor");
const packagedPublicRoot = path.join(kitRoot, "exports/assets/harbor");
const publicRoot = fs.existsSync(path.join(repositoryPublicRoot, "models/coral-staghorn.glb")) ? repositoryPublicRoot : packagedPublicRoot;
const input = JSON.parse(fs.readFileSync(path.join(kitRoot, "examples/minimal-input.json"), "utf8"));
const result = generate(input);
const captureVariant = process.env.HARBOR_CAPTURE_VARIANT === "baseline" ? "baseline" : "final";
const reviewRunRoot = path.join(kitRoot, "evidence/density-review/harbor-density-20260904-604a");
const baselineRoot = path.join(reviewRunRoot, "baseline");
const world = captureVariant === "baseline"
  ? JSON.parse(fs.readFileSync(path.join(baselineRoot, "world.json"), "utf8"))
  : result.artifact.world;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b4b4d);
const lighting = world.lighting || {
  hemisphere: { sky: "#d6f4e9", ground: "#17383b", intensity: 1.42 },
  sun: { color: "#ffefd1", intensity: 4, position: [-8.5, 15, 8] },
  fill: { color: "#77bdc4", intensity: 0.38, position: [8, 3.5, -7] },
};
scene.add(new THREE.HemisphereLight(lighting.hemisphere.sky, lighting.hemisphere.ground, lighting.hemisphere.intensity));
const sun = new THREE.DirectionalLight(lighting.sun.color, lighting.sun.intensity);
sun.position.set(...lighting.sun.position);
sun.castShadow = true;
scene.add(sun);
const fill = new THREE.DirectionalLight(lighting.fill.color, lighting.fill.intensity);
fill.position.set(...lighting.fill.position);
scene.add(fill);

function enableShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = cast;
    object.receiveShadow = receive;
  });
}

function createWaterNormal(size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size * Math.PI * 2;
      const v = y / size * Math.PI * 2;
      const dx = Math.cos(u * 2 + v) * 0.34 + Math.cos(u - v * 3) * 0.16;
      const dy = Math.sin(v * 2 - u) * 0.31 + Math.sin(v + u * 3) * 0.14;
      const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
      const offset = (y * size + x) * 4;
      data[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.needsUpdate = true;
  return texture;
}

const assetNames = ["boat.glb", "fish.glb", "rocks.glb", "sand.glb", "star.glb", ...new Set(world.placements.coral.map((placement) => placement.asset))];
const assets = new Map();
for (const fileName of assetNames) {
  const modelPath = captureVariant === "baseline" && fileName === "sand.glb"
    ? path.join(baselineRoot, "models", fileName)
    : path.join(publicRoot, "models", fileName);
  const loaded = await loadGltfFromFile(modelPath);
  const normalized = normalizeAsset(loaded.scene, fileName);
  if (captureVariant === "baseline" && fileName === "sand.glb") {
    normalized.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(normalized);
    normalized.position.y -= bounds.min.y;
  }
  normalized.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      for (const value of Object.values(material)) if (value?.isTexture && value.channel > 1) value.channel = 0;
    });
  });
  assets.set(fileName, normalized);
}

const sand = assets.get("sand.glb").clone(true);
sand.position.y = world.seabed.y;
sand.scale.set(world.seabed.radius, 1, world.seabed.radius);
enableShadows(sand, { cast: false, receive: true });
async function dataTexture(fileName, colorSpace = THREE.NoColorSpace) {
  const textureRoot = captureVariant === "baseline" ? path.join(baselineRoot, "textures") : path.join(publicRoot, "textures");
  const { data, info } = await sharp(path.join(textureRoot, fileName)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const texture = new THREE.DataTexture(new Uint8Array(data), info.width, info.height, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.channel = 0;
  texture.needsUpdate = true;
  return texture;
}
const [sandAlbedo, sandNormal, terrainAo] = await Promise.all([
  dataTexture(world.seabed.albedoTexture, THREE.SRGBColorSpace),
  dataTexture(world.seabed.normalTexture),
  world.seabed.aoTexture ? dataTexture(world.seabed.aoTexture) : Promise.resolve(null),
]);
sand.traverse((object) => {
  if (!object.isMesh) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach((material) => {
    material.map = sandAlbedo;
    material.normalMap = sandNormal;
    material.normalScale?.set(0.72, 0.72);
    if (terrainAo) {
      material.aoMap = terrainAo;
      material.aoMapIntensity = 0.7;
    }
    material.needsUpdate = true;
  });
});
scene.add(sand);

const boat = assets.get("boat.glb").clone(true);
boat.position.set(...world.boat.position);
boat.rotation.set(...world.boat.rotation);
boat.scale.setScalar(world.boat.scale);
enableShadows(boat);
scene.add(boat);

for (const placement of world.placements.fish) {
  const fish = assets.get("fish.glb").clone(true);
  fish.position.set(...placement.position);
  fish.rotation.set(...placement.rotation);
  fish.scale.setScalar(placement.scale);
  enableShadows(fish);
  scene.add(fish);
}

const rocks = instantiateAsset(
  assets.get("rocks.glb"),
  expandRockClusters(world.placements.rocks),
  "harbor-rocks-validation",
);
scene.add(rocks.group);

for (const placement of world.placements.stars) {
  const star = assets.get("star.glb").clone(true);
  star.position.set(...placement.position);
  star.rotation.set(...placement.rotation);
  star.scale.setScalar(placement.scale);
  enableShadows(star);
  scene.add(star);
}

for (const placement of world.placements.coral) {
  const coral = assets.get(placement.asset).clone(true);
  coral.position.set(...placement.position);
  coral.rotation.set(...placement.rotation);
  coral.scale.setScalar(placement.scale);
  enableShadows(coral);
  scene.add(coral);
}

const waterNormal = createWaterNormal();
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(world.water.size, world.water.size),
  new THREE.MeshPhysicalMaterial({
    color: 0x2b7f82,
    transparent: true,
    opacity: 0.3,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.08,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    depthWrite: false,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = world.water.y;
water.renderOrder = 5;
scene.add(water);

scene.updateMatrixWorld(true);
const options = { width: 960, height: 640 };
const captureProfiles = [
  { id: "web-top-down", position: world.camera.position, target: world.camera.target, fov: world.camera.fov },
  { id: "north-oblique", position: [0, 12, 17], target: [0, -1.1, 0], fov: 40 },
  { id: "north-east-oblique", position: [12, 12, 12], target: [0, -1.1, 0], fov: 40 },
  { id: "east-oblique", position: [17, 12, 0], target: [0, -1.1, 0], fov: 40 },
  { id: "south-east-oblique", position: [12, 12, -12], target: [0, -1.1, 0], fov: 40 },
  { id: "south-oblique", position: [0, 12, -17], target: [0, -1.1, 0], fov: 40 },
  { id: "south-west-oblique", position: [-12, 12, -12], target: [0, -1.1, 0], fov: 40 },
  { id: "west-oblique", position: [-17, 12, 0], target: [0, -1.1, 0], fov: 40 },
  { id: "north-west-oblique", position: [-12, 12, 12], target: [0, -1.1, 0], fov: 40 },
  { id: "grazing-water", position: [13, 5.8, 17], target: [0, -0.7, 0], fov: 42 },
];
const captureRoot = captureVariant === "baseline"
  ? path.join(baselineRoot, "captures")
  : path.join(kitRoot, "evidence/lighting-angles");
fs.mkdirSync(captureRoot, { recursive: true });
const captureRecords = [];
const contactTiles = [];
let webCapture = null;
for (const profile of captureProfiles) {
  const camera = new THREE.PerspectiveCamera(profile.fov, options.width / options.height, world.camera.near, world.camera.far);
  camera.position.set(...profile.position);
  camera.lookAt(...profile.target);
  camera.updateMatrixWorld(true);
  const first = render(scene, camera, options);
  const second = render(scene, camera, options);
  const firstHash = crypto.createHash("sha256").update(first).digest("hex");
  const secondHash = crypto.createHash("sha256").update(second).digest("hex");
  const imagePath = path.join(captureRoot, `${profile.id}.png`);
  fs.writeFileSync(imagePath, first);
  const tile = await sharp(first).resize(320, 213, { fit: "fill" }).png().toBuffer();
  contactTiles.push({ input: tile, left: (captureRecords.length % 5) * 320, top: Math.floor(captureRecords.length / 5) * 213 });
  captureRecords.push({
    ...profile,
    bytes: first.length,
    sha256: firstHash,
    secondSha256: secondHash,
    deterministic: firstHash === secondHash,
    image: path.relative(repositoryRoot, imagePath),
  });
  if (profile.id === "web-top-down") webCapture = first;
}
const contactSheetPath = path.join(captureRoot, "contact-sheet.png");
await sharp({ create: { width: 1600, height: 426, channels: 4, background: "#0b4b4d" } })
  .composite(contactTiles)
  .png()
  .toFile(contactSheetPath);

const firstHash = captureRecords[0].sha256;
const deterministic = captureRecords.every((record) => record.deterministic);
const imagePath = captureVariant === "baseline"
  ? path.join(baselineRoot, "headless-harbor.png")
  : path.join(kitRoot, "evidence/headless-harbor.png");
fs.writeFileSync(imagePath, webCapture);

const validation = {
  status: deterministic && captureRecords.every((record) => record.bytes > 1000) ? "pass" : "fail",
  renderer: "@headless-three/renderer",
  adapter: process.env.VK_ICD_FILENAMES ? "task-local Mesa Lavapipe" : "system adapter",
  dimensions: [options.width, options.height],
  bytes: webCapture.length,
  firstHash,
  secondHash: captureRecords[0].secondSha256,
  deterministic,
  captureVariant,
  captures: captureRecords,
  contactSheet: path.relative(repositoryRoot, contactSheetPath),
  coverage: "Production Objaverse-derived GLBs, embedded PBR textures, project camera, locked multi-angle lighting, depth, and a normal-mapped transparent-water surrogate. Browser PCF shadow-map and exact GLSL execution remain separate validation surfaces.",
  image: path.relative(repositoryRoot, imagePath),
};
const validationPath = captureVariant === "baseline"
  ? path.join(baselineRoot, "headless-validation.json")
  : path.join(kitRoot, "evidence/headless-validation.json");
fs.writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);

const runReportPath = path.join(kitRoot, "evidence/run-report.json");
if (captureVariant === "final" && fs.existsSync(runReportPath)) {
  const report = JSON.parse(fs.readFileSync(runReportPath, "utf8"));
  report.visualCapture = validation;
  report.status = report.status === "pass" && validation.status === "pass" ? "pass" : "fail";
  fs.writeFileSync(runReportPath, `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
if (validation.status !== "pass") process.exitCode = 1;
