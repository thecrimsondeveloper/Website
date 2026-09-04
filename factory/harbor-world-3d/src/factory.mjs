import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const FACTORY_ID = "crimson-harbor-world-3d";
const FACTORY_VERSION = "1.0.0";
const DEFAULT_SEED = "crimson-harbor-604";
const CORAL_ASSETS = Object.freeze([
  "coral-staghorn.glb",
  "coral-brain.glb",
  "coral-lettuce.glb",
  "coral-sea-fan.glb",
  "coral-table.glb",
]);

const PARAMETER_RULES = Object.freeze({
  coralCount: { minimum: 8, maximum: 18, integer: true, defaultValue: 13 },
  fishCount: { minimum: 4, maximum: 12, integer: true, defaultValue: 8 },
  rockClusterCount: { minimum: 2, maximum: 5, integer: true, defaultValue: 3 },
  worldRadius: { minimum: 8, maximum: 14, integer: false, defaultValue: 11 },
  waterClarity: { minimum: 0.55, maximum: 0.92, integer: false, defaultValue: 0.8 },
});

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

export function stableStringify(value) {
  return JSON.stringify(sorted(value));
}

export function hashText(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function stream(seed, name) {
  return mulberry32(Number.parseInt(hashText(`${seed}:${name}`), 16));
}

function between(random, minimum, maximum) {
  return minimum + (maximum - minimum) * random();
}

function round(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function normalizeParams(params = {}) {
  return Object.fromEntries(Object.entries(PARAMETER_RULES).map(([name, rule]) => {
    const candidate = params[name] ?? rule.defaultValue;
    if (!Number.isFinite(candidate)) throw new RangeError(`${name} must be finite.`);
    if (candidate < rule.minimum || candidate > rule.maximum) {
      throw new RangeError(`${name} must be between ${rule.minimum} and ${rule.maximum}.`);
    }
    return [name, rule.integer ? Math.round(candidate) : round(candidate)];
  }));
}

function radialPlacement(random, minimumRadius, maximumRadius, y) {
  const angle = between(random, 0, Math.PI * 2);
  const radius = between(random, minimumRadius, maximumRadius);
  return [round(Math.cos(angle) * radius), round(y), round(Math.sin(angle) * radius)];
}

function buildPlacements(seed, params) {
  const coralRandom = stream(seed, "coral-placement");
  const rockRandom = stream(seed, "rock-placement");
  const fishRandom = stream(seed, "fish-placement");
  const starRandom = stream(seed, "star-placement");

  const coral = Array.from({ length: params.coralCount }, (_, index) => ({
    id: `coral-${String(index + 1).padStart(2, "0")}`,
    asset: CORAL_ASSETS[index % CORAL_ASSETS.length],
    position: radialPlacement(coralRandom, 3.7, params.worldRadius, -2.45),
    rotation: [0, round(between(coralRandom, 0, Math.PI * 2)), 0],
    scale: round(between(coralRandom, 0.28, 0.58)),
    swayPhase: round(between(coralRandom, 0, Math.PI * 2)),
  }));

  const rocks = Array.from({ length: params.rockClusterCount }, (_, index) => ({
    id: `rocks-${String(index + 1).padStart(2, "0")}`,
    asset: "rocks.glb",
    position: radialPlacement(rockRandom, 4.2, params.worldRadius, -2.38),
    rotation: [0, round(between(rockRandom, 0, Math.PI * 2)), 0],
    scale: round(between(rockRandom, 0.75, 1.35)),
  }));

  const fish = Array.from({ length: params.fishCount }, (_, index) => ({
    id: `fish-${String(index + 1).padStart(2, "0")}`,
    asset: "fish.glb",
    position: radialPlacement(fishRandom, 2.8, params.worldRadius - 1, between(fishRandom, -1.65, -0.55)),
    rotation: [0, round(between(fishRandom, 0, Math.PI * 2)), 0],
    scale: round(between(fishRandom, 0.3, 0.55)),
    speed: round(between(fishRandom, 0.18, 0.36)),
    phase: round(between(fishRandom, 0, Math.PI * 2)),
    orbit: round(between(fishRandom, 0.45, 1.2)),
  }));

  const starAnchors = [[-4.8, 2.9], [5.2, 1.4], [3.8, -4.4]];
  const stars = starAnchors.map(([x, z], index) => ({
    id: `star-${index + 1}`,
    asset: "star.glb",
    position: [round(x + between(starRandom, -0.35, 0.35)), 0.72, round(z + between(starRandom, -0.35, 0.35))],
    rotation: [Math.PI / 2, 0, round(between(starRandom, 0, Math.PI * 2))],
    scale: round(between(starRandom, 0.48, 0.62)),
    phase: round(between(starRandom, 0, Math.PI * 2)),
  }));

  return { coral, rocks, fish, stars };
}

export function describe() {
  return {
    factoryId: FACTORY_ID,
    version: FACTORY_VERSION,
    factoryType: "composed",
    source: {
      repository: "LuminaryLabs-Dev/NexusFactory-Kits",
      commit: "627c4aeb864f438c3b1a24a00b152a17d24e8cf9",
      license: "MIT",
    },
    parameters: PARAMETER_RULES,
    streams: ["coral-placement", "rock-placement", "fish-placement", "star-placement"],
    stages: ["asset-geometry", "world-layout", "glb-export"],
    outputs: ["boat.glb", "fish.glb", "rocks.glb", "star.glb", "world.json", "harbor.manifest.json"],
  };
}

export function generate(request = {}) {
  if (request.sourceReady === false) {
    throw new Error("Required NexusFactory coral source is blocked.");
  }
  const seed = String(request.seed ?? DEFAULT_SEED).trim();
  if (!seed) throw new RangeError("seed must not be empty.");
  const params = normalizeParams(request.params);
  const placements = buildPlacements(seed, params);
  const artifact = {
    schema: "crimson-harbor/factory-artifact/1",
    factoryId: FACTORY_ID,
    version: FACTORY_VERSION,
    synthetic: true,
    seed,
    seedPolicy: describe().streams,
    params,
    assets: {
      boat: "boat.glb",
      fish: "fish.glb",
      rocks: "rocks.glb",
      star: "star.glb",
      coral: CORAL_ASSETS,
    },
    world: {
      camera: { fov: 34, position: [0, 17.5, 12.5], target: [0, -1.1, 0], near: 0.1, far: 80 },
      seabed: { y: -2.5, radius: params.worldRadius + 5, color: "#c0a989" },
      water: { y: 0, size: (params.worldRadius + 5) * 2, speed: 0.72, clarity: params.waterClarity },
      boat: { asset: "boat.glb", position: [0, 0.16, 0], rotation: [0, 0.22, 0], scale: 1, rocking: 0.8 },
      placements,
    },
  };
  const semanticSignature = `fnv1a:${hashText(stableStringify(artifact))}`;
  return {
    artifact,
    semanticSignature,
    stages: [
      { id: "asset-geometry", status: "pass", outputSignature: `fnv1a:${hashText("harbor-primitives-v1")}` },
      { id: "world-layout", status: "pass", outputSignature: semanticSignature },
    ],
    warnings: [],
  };
}

export function randomize(request = {}) {
  const seed = String(request.seed ?? `${DEFAULT_SEED}:randomize`);
  const random = stream(seed, "parameters");
  return {
    seed,
    params: Object.fromEntries(Object.entries(PARAMETER_RULES).map(([name, rule]) => {
      const value = between(random, rule.minimum, rule.maximum);
      return [name, rule.integer ? Math.round(value) : round(value)];
    })),
  };
}

export function reroll(request = {}) {
  const seed = String(request.seed ?? DEFAULT_SEED);
  const streamName = String(request.stream ?? "world");
  return {
    ...request,
    seed: `${seed}:${streamName}:${hashText(`${seed}:${streamName}`)}`,
    params: normalizeParams(request.params),
  };
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.72, metalness: options.metalness ?? 0.02, ...options });
}

function createBoat() {
  const root = new THREE.Group();
  root.name = "Crimson fishing boat";

  const outline = new THREE.Shape();
  outline.moveTo(0, 2.1);
  outline.quadraticCurveTo(0.78, 1.35, 0.72, -1.55);
  outline.quadraticCurveTo(0.45, -1.9, 0, -1.94);
  outline.quadraticCurveTo(-0.45, -1.9, -0.72, -1.55);
  outline.quadraticCurveTo(-0.78, 1.35, 0, 2.1);

  const hullGeometry = new THREE.ExtrudeGeometry(outline, { depth: 0.5, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.12, bevelThickness: 0.12, curveSegments: 8 });
  hullGeometry.rotateX(-Math.PI / 2);
  hullGeometry.center();
  const hull = new THREE.Mesh(hullGeometry, material(0xe9dfca, { roughness: 0.58 }));
  hull.scale.set(1, 0.64, 1);
  root.add(hull);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.18, 2.7), material(0xb94f3c, { roughness: 0.52 }));
  stripe.position.set(0, 0.26, -0.02);
  root.add(stripe);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.17, 2.25), material(0x765035, { roughness: 0.88 }));
  deck.position.set(0, 0.39, -0.12);
  root.add(deck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.62, 0.92), material(0xf4ead5, { roughness: 0.62 }));
  cabin.position.set(0, 0.76, -0.28);
  root.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 1.05), material(0x173f43, { roughness: 0.42 }));
  roof.position.set(0, 1.1, -0.28);
  root.add(roof);

  const windowMaterial = material(0x4fa6ad, { roughness: 0.18, metalness: 0.05 });
  const window = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.25, 0.04), windowMaterial);
  window.position.set(0, 0.84, 0.2);
  root.add(window);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.55, 8), material(0x7c5432));
  mast.position.set(0, 1.35, 0.72);
  root.add(mast);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 8), material(0x7c5432));
  boom.rotation.z = Math.PI / 2;
  boom.position.set(0.36, 1.72, 0.72);
  root.add(boom);

  root.scale.setScalar(0.88);
  return root;
}

function createFish() {
  const root = new THREE.Group();
  root.name = "Low-poly reef fish";
  const bodyMaterial = material(0xf3a35f, { roughness: 0.56 });
  const accentMaterial = material(0xffd48e, { roughness: 0.58, side: THREE.DoubleSide });
  const darkMaterial = material(0x193f43, { roughness: 0.45 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10), bodyMaterial);
  body.scale.set(1.45, 0.62, 0.42);
  root.add(body);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.82, 3), accentMaterial);
  tail.rotation.z = -Math.PI / 2;
  tail.position.x = -1.25;
  tail.scale.z = 0.5;
  root.add(tail);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.72, 3), accentMaterial);
  dorsal.position.set(-0.08, 0.55, 0);
  dorsal.rotation.z = Math.PI;
  dorsal.scale.z = 0.25;
  root.add(dorsal);

  const eyeGeometry = new THREE.SphereGeometry(0.075, 10, 7);
  for (const z of [-0.31, 0.31]) {
    const eye = new THREE.Mesh(eyeGeometry, darkMaterial);
    eye.position.set(0.67, 0.17, z);
    root.add(eye);
  }
  return root;
}

function createRocks() {
  const root = new THREE.Group();
  root.name = "Harbor rock cluster";
  const colors = [0x766f66, 0x8b7f70, 0x625f59];
  const positions = [[-0.85, 0.22, 0.2], [0.05, 0.35, -0.18], [0.85, 0.18, 0.28], [0.35, 0.12, 0.78]];
  positions.forEach((position, index) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 0), material(colors[index % colors.length], { roughness: 0.96 }));
    rock.position.set(...position);
    rock.scale.set(1 + index * 0.08, 0.58 + index * 0.06, 0.82 + (index % 2) * 0.18);
    rock.rotation.set(index * 0.37, index * 0.58, index * 0.23);
    root.add(rock);
  });
  return root;
}

function createStar() {
  const shape = new THREE.Shape();
  const points = 10;
  for (let index = 0; index < points; index += 1) {
    const radius = index % 2 === 0 ? 0.72 : 0.31;
    const angle = Math.PI / 2 + (index / points) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.06, bevelThickness: 0.05 });
  geometry.center();
  const star = new THREE.Mesh(geometry, material(0xffda82, { roughness: 0.28, metalness: 0.08, emissive: 0x6e4213, emissiveIntensity: 0.3 }));
  const root = new THREE.Group();
  root.name = "Catchable harbor star";
  root.add(star);
  return root;
}

export function buildAssetGroups() {
  return {
    boat: createBoat(),
    fish: createFish(),
    rocks: createRocks(),
    star: createStar(),
  };
}

function geometryStats(root) {
  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let invalidValueCount = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    meshCount += 1;
    const position = object.geometry.getAttribute("position");
    if (position) {
      vertexCount += position.count;
      for (let index = 0; index < position.array.length; index += 1) {
        if (!Number.isFinite(position.array[index])) invalidValueCount += 1;
      }
    }
    triangleCount += object.geometry.index ? object.geometry.index.count / 3 : (position?.count ?? 0) / 3;
  });
  return { meshCount, vertexCount, triangleCount: Math.round(triangleCount), invalidValueCount };
}

export function validate(result) {
  const checks = [];
  const artifact = result?.artifact;
  checks.push({ id: "artifact-shape", pass: artifact?.schema === "crimson-harbor/factory-artifact/1" });
  checks.push({ id: "semantic-signature", pass: result?.semanticSignature === `fnv1a:${hashText(stableStringify(artifact))}` });
  checks.push({ id: "coral-count", pass: artifact?.world?.placements?.coral?.length === artifact?.params?.coralCount });
  checks.push({ id: "fish-count", pass: artifact?.world?.placements?.fish?.length === artifact?.params?.fishCount });
  checks.push({ id: "star-count", pass: artifact?.world?.placements?.stars?.length === 3 });

  const assets = buildAssetGroups();
  const assetStats = Object.fromEntries(Object.entries(assets).map(([name, root]) => [name, geometryStats(root)]));
  checks.push({ id: "finite-geometry", pass: Object.values(assetStats).every((stats) => stats.invalidValueCount === 0 && stats.triangleCount > 0) });
  checks.push({ id: "triangle-budget", pass: Object.values(assetStats).reduce((total, stats) => total + stats.triangleCount, 0) < 12000 });
  return {
    valid: checks.every((check) => check.pass),
    authority: "Independent structural checks over generated result and Three.js BufferGeometry",
    checks,
    assetStats,
  };
}

function installFileReaderPolyfill() {
  if (typeof globalThis.FileReader !== "undefined") return;
  globalThis.FileReader = class FileReader {
    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        this.onloadend?.();
      } catch (error) {
        this.error = error;
        this.onerror?.(error);
      }
    }

    async readAsDataURL(blob) {
      try {
        const bytes = Buffer.from(await blob.arrayBuffer());
        this.result = `data:${blob.type || "application/octet-stream"};base64,${bytes.toString("base64")}`;
        this.onloadend?.();
      } catch (error) {
        this.error = error;
        this.onerror?.(error);
      }
    }
  };
}

async function exportGlb(root) {
  installFileReaderPolyfill();
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(root, (output) => resolve(output), reject, { binary: true, onlyVisible: true, trs: false });
  });
}

export async function exportFactory(result, request = {}) {
  const validation = validate(result);
  if (!validation.valid) throw new Error("Refusing to export an invalid harbor artifact.");
  const groups = buildAssetGroups();
  const files = [];
  for (const [name, root] of Object.entries(groups)) {
    const output = await exportGlb(root);
    files.push({ fileName: `${name}.glb`, mediaType: "model/gltf-binary", bytes: new Uint8Array(output) });
  }

  const world = {
    schema: "crimson-harbor/world/2",
    factory: { id: FACTORY_ID, version: FACTORY_VERSION, semanticSignature: result.semanticSignature },
    seed: result.artifact.seed,
    ...result.artifact.world,
  };
  files.push({ fileName: "world.json", mediaType: "application/json", text: `${JSON.stringify(world, null, 2)}\n` });
  return {
    factoryId: FACTORY_ID,
    resultSignature: result.semanticSignature,
    requestedFormat: request.format ?? "harbor-package",
    files,
    validation,
  };
}

export { exportFactory as export };
