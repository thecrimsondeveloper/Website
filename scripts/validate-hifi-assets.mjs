import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { loadGltfFromFile, render } from "@headless-three/renderer";
import { normalizeAsset } from "../src/components/shader-renderer/three-backend.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(repositoryRoot, "public/assets/harbor/models");
const baselineRoot = path.resolve(repositoryRoot, "../harbor-hifi-work/baseline-runtime-glb");
const evidenceRoot = path.join(repositoryRoot, "factory/harbor-world-3d/evidence/hifi-assets");
const reportPath = path.join(evidenceRoot, "asset-validation.json");
const previousReport = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null;
const tolerance = 1e-5;
const assets = [
  ["boat.glb", 12000, 18000],
  ["fish.glb", 2500, 4000],
  ["star.glb", 4000, 6500],
  ["coral-staghorn.glb", 8000, 15000],
  ["coral-brain.glb", 8000, 13000],
  ["coral-lettuce.glb", 10000, 20000],
  ["coral-sea-fan.glb", 12000, 52000],
  ["coral-table.glb", 10000, 19000],
  ["rocks.glb", 800, 1000],
  ["sand.glb", 32768, 32768],
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function inspectPrimitive(object) {
  const geometry = object.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, item) => item);
  const weldedKeys = new Map();
  const welded = Array.from({ length: position.count }, (_, item) => {
    const key = [position.getX(item), position.getY(item), position.getZ(item)].map((value) => Math.round(value / tolerance)).join(":");
    if (!weldedKeys.has(key)) weldedKeys.set(key, weldedKeys.size);
    return weldedKeys.get(key);
  });
  const edges = new Map();
  const faces = new Set();
  let invalidValues = 0;
  let degenerateTriangles = 0;
  let duplicateTriangles = 0;

  for (const value of position.array) if (!Number.isFinite(value)) invalidValues += 1;
  const addEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const edge = edges.get(key) || { count: 0, balance: 0 };
    edge.count += 1;
    edge.balance += a < b ? 1 : -1;
    edges.set(key, edge);
  };
  for (let item = 0; item < index.length; item += 3) {
    const a = welded[index[item]];
    const b = welded[index[item + 1]];
    const c = welded[index[item + 2]];
    if (a === b || b === c || c === a) {
      degenerateTriangles += 1;
      continue;
    }
    const faceKey = [a, b, c].sort((left, right) => left - right).join(":");
    if (faces.has(faceKey)) duplicateTriangles += 1;
    faces.add(faceKey);
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  const edgeValues = [...edges.values()];
  return {
    name: object.name,
    vertices: position.count,
    triangles: index.length / 3,
    invalidValues,
    degenerateTriangles,
    duplicateTriangles,
    boundaryEdges: edgeValues.filter((edge) => edge.count === 1).length,
    nonManifoldEdges: edgeValues.filter((edge) => edge.count > 2).length,
    windingErrors: edgeValues.filter((edge) => edge.count === 2 && edge.balance !== 0).length,
    normalsValid: Boolean(normal && normal.count === position.count),
    uvsValid: Boolean(uv && uv.count === position.count),
  };
}

function inspectScene(scene, bytes, minimum, maximum) {
  const primitives = [];
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.getAttribute("position")) return;
    primitives.push(inspectPrimitive(object));
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => {
      materials.add(material.uuid);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value.uuid);
    });
  });
  const triangles = primitives.reduce((total, primitive) => total + primitive.triangles, 0);
  const structuralPass = primitives.length > 0 && primitives.every((primitive) => (
    primitive.invalidValues === 0
    && primitive.degenerateTriangles === 0
    && primitive.duplicateTriangles === 0
    && primitive.normalsValid
  ));
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    triangles,
    triangleBudget: [minimum, maximum],
    triangleBudgetPass: triangles >= minimum && triangles <= maximum,
    materialCount: materials.size,
    textureCount: textures.size,
    primitives,
    structuralPass,
  };
}

function addStudio(scene) {
  scene.background = new THREE.Color(0x123f42);
  scene.add(new THREE.HemisphereLight(0xe5f5ea, 0x18383a, 2.4));
  const key = new THREE.DirectionalLight(0xffe8ca, 4.2);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ecbd0, 1.2);
  fill.position.set(5, 2, -4);
  scene.add(fill);
}

function normalizeHeadlessTextureChannels(root) {
  let remapped = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      for (const value of Object.values(material)) {
        if (value?.isTexture && value.channel > 1) {
          value.channel = 0;
          remapped += 1;
        }
      }
    });
  });
  return remapped;
}

async function renderAsset(fileName, sourceRoot, variant) {
  const loaded = await loadGltfFromFile(path.join(sourceRoot, fileName));
  const root = normalizeAsset(loaded.scene, fileName);
  const remappedTextureChannels = normalizeHeadlessTextureChannels(root);
  const scene = new THREE.Scene();
  addStudio(scene);
  const turntable = new THREE.Group();
  turntable.add(root);
  scene.add(turntable);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  camera.position.set(radius * 1.35, center.y + radius * 0.9, radius * 1.75);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const directory = path.join(evidenceRoot, "renders", fileName.replace(".glb", ""));
  fs.mkdirSync(directory, { recursive: true });
  const captures = [];
  for (let angle = 0; angle < 10; angle += 1) {
    turntable.rotation.y = (angle / 10) * Math.PI * 2;
    turntable.updateMatrixWorld(true);
    const png = render(scene, camera, { width: 384, height: 384 });
    const output = path.join(directory, `${variant}-${String(angle).padStart(2, "0")}.png`);
    fs.writeFileSync(output, png);
    captures.push({ file: path.relative(repositoryRoot, output), sha256: sha256(png), bytes: png.length });
  }
  return { captures, remappedTextureChannels };
}

fs.mkdirSync(evidenceRoot, { recursive: true });
const records = [];
for (const [fileName, minimum, maximum] of assets) {
  const runtimePath = path.join(runtimeRoot, fileName);
  const bytes = fs.readFileSync(runtimePath);
  const loaded = await loadGltfFromFile(runtimePath);
  const inspection = inspectScene(loaded.scene, bytes, minimum, maximum);
  const previous = previousReport?.assets?.find((record) => record.fileName === fileName);
  const capturesExist = (captureSet) => captureSet?.captures?.length === 10
    && captureSet.captures.every(({ file }) => fs.existsSync(path.join(repositoryRoot, file)));
  const baselineCaptures = capturesExist(previous?.captures?.baseline)
    ? previous.captures.baseline
    : await renderAsset(fileName, baselineRoot, "baseline");
  const candidateCaptures = previous?.sha256 === inspection.sha256 && capturesExist(previous?.captures?.candidate)
    ? previous.captures.candidate
    : await renderAsset(fileName, runtimeRoot, "candidate");
  records.push({ fileName, ...inspection, externalTextureSet: fileName === "sand.glb", captures: { baseline: baselineCaptures, candidate: candidateCaptures } });
}

const report = {
  schemaVersion: "harbor-hifi-assets/1",
  captureProfile: {
    renderer: "@headless-three/renderer",
    adapter: process.env.VK_ICD_FILENAMES ? "task-local Mesa Lavapipe" : "system adapter",
    dimensions: [384, 384],
    orbitAngles: 10,
    fov: 34,
    lighting: "locked two-light studio",
    background: "#123f42",
    limitation: "Texture coordinates above channel 1 are remapped to channel 0 only in headless captures; production GLBs are unchanged. Browser WebGL2 validation is recorded separately and remains pending when no Chromium executable is available.",
  },
  assets: records,
  totalBytes: records.reduce((total, record) => total + record.bytes, 0),
  totalTriangles: records.reduce((total, record) => total + record.triangles, 0),
  verdict: records.every((record) => record.structuralPass && record.triangleBudgetPass && (record.textureCount > 0 || record.externalTextureSet)) ? "pass" : "fail",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ verdict: report.verdict, totalBytes: report.totalBytes, totalTriangles: report.totalTriangles, assets: records.map(({ fileName, triangles, triangleBudgetPass, textureCount, structuralPass }) => ({ fileName, triangles, triangleBudgetPass, textureCount, structuralPass })) }, null, 2)}\n`);
if (report.verdict !== "pass") process.exitCode = 1;
