import * as THREE from "three";
import { buildAssetGroups, buildSurfaceTextures, generate, validate } from "./factory.mjs";

const canvas = document.querySelector("canvas");
const status = document.querySelector("#status");
const result = generate({ seed: "crimson-harbor-604" });
const report = validate(result);
const assets = buildAssetGroups();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a4648);
scene.add(new THREE.HemisphereLight(0xd7f3e8, 0x264748, 2.6));
const sun = new THREE.DirectionalLight(0xffeed2, 3.1);
sun.position.set(-5, 10, 7);
scene.add(sun);
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
assets.rocks.traverse((object) => {
  if (!object.isMesh) return;
  object.material.map = rockAlbedo;
  object.material.normalMap = rockNormal;
  object.material.normalScale = new THREE.Vector2(0.62, 0.62);
});
assets.sand.traverse((object) => {
  if (!object.isMesh) return;
  object.material.map = dataTexture("sand-albedo.png", [5, 5]);
  object.material.normalMap = dataTexture("sand-normal.png", [5, 5]);
  object.material.normalScale = new THREE.Vector2(0.34, 0.34);
});
assets.sand.position.y = result.artifact.world.seabed.y;
assets.sand.scale.set(result.artifact.world.seabed.radius, 1, result.artifact.world.seabed.radius);
scene.add(assets.sand);

assets.boat.position.set(0, 0.16, 0);
scene.add(assets.boat);
for (const [index, record] of result.artifact.world.placements.fish.entries()) {
  if (index >= 6) break;
  const fish = assets.fish.clone(true);
  fish.position.set(...record.position);
  fish.rotation.set(...record.rotation);
  fish.scale.setScalar(record.scale);
  scene.add(fish);
}
for (const record of result.artifact.world.placements.rocks) {
  const rocks = assets.rocks.clone(true);
  rocks.position.set(...record.position);
  rocks.rotation.set(...record.rotation);
  rocks.scale.setScalar(record.scale);
  scene.add(rocks);
}
for (const record of result.artifact.world.placements.stars) {
  const star = assets.star.clone(true);
  star.position.set(...record.position);
  star.rotation.set(...record.rotation);
  star.scale.setScalar(record.scale);
  scene.add(star);
}

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
camera.position.set(0, 21, 8);
camera.lookAt(0, -1.15, 0);
function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function loop(time) {
  resize();
  assets.boat.rotation.z = Math.sin(time * 0.0007) * 0.035;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
status.textContent = `${report.valid ? "Validated" : "Failed"} · ${result.semanticSignature}`;
requestAnimationFrame(loop);
