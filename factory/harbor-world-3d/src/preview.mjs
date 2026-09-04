import * as THREE from "three";
import { buildAssetGroups, generate, validate } from "./factory.mjs";

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
const floor = new THREE.Mesh(new THREE.CircleGeometry(10, 40), new THREE.MeshStandardMaterial({ color: 0xbca482, roughness: 0.94 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.5;
scene.add(floor);

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
camera.position.set(0, 17.5, 12.5);
camera.lookAt(0, -1.1, 0);
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
