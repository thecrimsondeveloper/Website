import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildPlacements, createCurveNetwork, layoutChecks } from "./layout.mjs";
import {
  buildTerrainTextures,
  createTerrainDefinition,
  createTerrainGroup,
  TERRAIN_SEGMENTS,
  TERRAIN_TEXTURE_SIZE,
} from "./terrain.mjs";

const FACTORY_ID = "crimson-harbor-world-3d";
const FACTORY_VERSION = "1.2.0";
const DEFAULT_SEED = "crimson-harbor-604";
const SURFACE_TEXTURE_SIZE = 256;
const ROCK_TRIANGLE_MINIMUM = 500;
const ROCK_TRIANGLE_MAXIMUM = 1000;
const CORAL_ASSETS = Object.freeze([
  "coral-staghorn.glb",
  "coral-brain.glb",
  "coral-lettuce.glb",
  "coral-sea-fan.glb",
  "coral-table.glb",
]);

const PARAMETER_RULES = Object.freeze({
  coralCount: { minimum: 8, maximum: 42, integer: true, defaultValue: 42 },
  fishCount: { minimum: 4, maximum: 18, integer: true, defaultValue: 18 },
  rockClusterCount: { minimum: 2, maximum: 48, integer: true, defaultValue: 48 },
  starCount: { minimum: 3, maximum: 6, integer: true, defaultValue: 6 },
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
    streams: ["terrain-broad-a", "terrain-broad-b", "terrain-ripples", "curve:*", "coral-placement", "rock-placement", "rock-geometry", "surface-textures", "fish-placement", "star-placement"],
    stages: ["curve-network", "heightfield", "asset-geometry", "surface-textures", "world-layout", "glb-export"],
    outputs: ["boat.glb", "fish.glb", "rocks.glb", "sand.glb", "star.glb", "textures/*.png", "world.json", "harbor.manifest.json"],
  };
}

export function generate(request = {}) {
  if (request.sourceReady === false) {
    throw new Error("Required NexusFactory coral source is blocked.");
  }
  const seed = String(request.seed ?? DEFAULT_SEED).trim();
  if (!seed) throw new RangeError("seed must not be empty.");
  const params = normalizeParams(request.params);
  const curves = createCurveNetwork(seed, params.worldRadius);
  const terrain = createTerrainDefinition(seed, params.worldRadius, curves);
  const placements = buildPlacements(seed, params, terrain, curves, CORAL_ASSETS);
  const artifact = {
    schema: "crimson-harbor/factory-artifact/2",
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
      sand: "sand.glb",
      star: "star.glb",
      coral: CORAL_ASSETS,
      textures: {
        rockAlbedo: "rock-albedo.png",
        rockNormal: "rock-normal.png",
        sandAlbedo: "sand-albedo.png",
        sandNormal: "sand-normal.png",
        terrainHeight: "terrain-height.png",
        terrainAo: "terrain-ao.png",
      },
    },
    world: {
      camera: { fov: 34, position: [0, 21, 8], target: [0, -1.15, 0], near: 0.1, far: 80 },
      seabed: {
        asset: "sand.glb",
        y: terrain.baseY,
        radius: terrain.radius,
        color: "#c9b58f",
        albedoTexture: "sand-albedo.png",
        normalTexture: "sand-normal.png",
        aoTexture: "terrain-ao.png",
        heightTexture: "terrain-height.png",
      },
      terrain,
      curves,
      qualityCounts: {
        high: { rocks: params.rockClusterCount, coral: params.coralCount, fish: params.fishCount, stars: params.starCount },
        auto: { rocks: Math.min(params.rockClusterCount, 34), coral: Math.min(params.coralCount, 30), fish: Math.min(params.fishCount, 12), stars: params.starCount },
        low: { rocks: Math.min(params.rockClusterCount, 20), coral: Math.min(params.coralCount, 18), fish: Math.min(params.fishCount, 8), stars: params.starCount },
      },
      lighting: {
        hemisphere: { sky: "#d6f4e9", ground: "#17383b", intensity: 1.42 },
        sun: { color: "#ffefd1", intensity: 4, position: [-8.5, 15, 8], target: [0, -1.55, 0] },
        fill: { color: "#77bdc4", intensity: 0.38, position: [8, 3.5, -7] },
        exposure: 1.06,
      },
      water: { y: 0, size: terrain.radius * 2, speed: 0.72, clarity: params.waterClarity },
      boat: { asset: "boat.glb", position: [0, 0.16, 0], rotation: [0, 0.22, 0], scale: 1, rocking: 0.8 },
      placements,
    },
  };
  const semanticSignature = `fnv1a:${hashText(stableStringify(artifact))}`;
  return {
    artifact,
    semanticSignature,
    stages: [
      { id: "curve-network", status: "pass", outputSignature: `fnv1a:${hashText(stableStringify(curves))}` },
      { id: "heightfield", status: "pass", outputSignature: `fnv1a:${hashText(stableStringify(terrain))}` },
      { id: "asset-geometry", status: "pass", outputSignature: `fnv1a:${hashText("harbor-primitives-v2")}` },
      { id: "surface-textures", status: "pass", outputSignature: `fnv1a:${hashText("harbor-textures-256-v2")}` },
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

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenateBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function uint32Bytes(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  return concatenateBytes([uint32Bytes(data.length), typeBytes, data, uint32Bytes(crc32(concatenateBytes([typeBytes, data])))]);
}

async function deflateBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodePng(width, height, rgba) {
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), target + 1);
  }
  return concatenateBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", await deflateBytes(scanlines)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function wrap(value) {
  return value - Math.floor(value);
}

function rockHeight(u, v) {
  const turn = Math.PI * 2;
  return 0.5
    + Math.sin(turn * (u * 3 + v * 2)) * 0.19
    + Math.cos(turn * (u * 7 - v * 5)) * 0.09
    + Math.sin(turn * (u * 13 + v * 11)) * 0.045;
}

function createSurfaceTexture(fileName, heightFunction, colorFunction, normalStrength) {
  const width = SURFACE_TEXTURE_SIZE;
  const height = SURFACE_TEXTURE_SIZE;
  const albedo = new Uint8Array(width * height * 4);
  const normal = new Uint8Array(width * height * 4);
  const pixelStep = 1 / width;

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const offset = (y * width + x) * 4;
      const heightValue = heightFunction(u, v);
      const color = colorFunction(u, v, heightValue);
      albedo[offset] = color[0];
      albedo[offset + 1] = color[1];
      albedo[offset + 2] = color[2];
      albedo[offset + 3] = 255;

      const left = heightFunction(wrap(u - pixelStep), v);
      const right = heightFunction(wrap(u + pixelStep), v);
      const down = heightFunction(u, wrap(v - pixelStep));
      const up = heightFunction(u, wrap(v + pixelStep));
      const tangentNormal = new THREE.Vector3((left - right) * normalStrength, (down - up) * normalStrength, 1).normalize();
      normal[offset] = Math.round((tangentNormal.x * 0.5 + 0.5) * 255);
      normal[offset + 1] = Math.round((tangentNormal.y * 0.5 + 0.5) * 255);
      normal[offset + 2] = Math.round((tangentNormal.z * 0.5 + 0.5) * 255);
      normal[offset + 3] = 255;
    }
  }

  return [
    { fileName: `textures/${fileName}-albedo.png`, width, height, rgba: albedo, colorSpace: "srgb" },
    { fileName: `textures/${fileName}-normal.png`, width, height, rgba: normal, colorSpace: "linear" },
  ];
}

function defaultTerrain() {
  const curves = createCurveNetwork(DEFAULT_SEED, PARAMETER_RULES.worldRadius.defaultValue);
  return createTerrainDefinition(DEFAULT_SEED, PARAMETER_RULES.worldRadius.defaultValue, curves);
}

export function buildSurfaceTextures(terrain = defaultTerrain()) {
  const rockTextures = createSurfaceTexture(
    "rock",
    rockHeight,
    (u, v, heightValue) => {
      const lichen = Math.max(0, Math.sin((u * 17 + v * 9) * Math.PI * 2) - 0.58);
      return [
        Math.round(91 + heightValue * 30 + lichen * 18),
        Math.round(87 + heightValue * 28 + lichen * 27),
        Math.round(78 + heightValue * 24 + lichen * 12),
      ];
    },
    18,
  );
  return [...rockTextures, ...buildTerrainTextures(terrain)];
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

function createRockGeometry(index) {
  const geometry = new THREE.SphereGeometry(0.72, 32, 15);
  const position = geometry.getAttribute("position");
  const random = stream(DEFAULT_SEED, `rock-geometry:${index}`);
  const phaseA = between(random, 0, Math.PI * 2);
  const phaseB = between(random, 0, Math.PI * 2);
  const phaseC = between(random, 0, Math.PI * 2);
  const direction = new THREE.Vector3();

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    direction.fromBufferAttribute(position, vertex).normalize();
    const broad = Math.sin(direction.x * 4.7 + phaseA) * Math.cos(direction.z * 4.1 - phaseB);
    const strata = Math.sin((direction.y + direction.x * 0.42) * 11 + phaseC);
    const grain = Math.cos((direction.x - direction.z) * 23 + phaseB) * 0.025;
    const radius = 0.9 + broad * 0.105 + strata * 0.045 + grain;
    position.setXYZ(vertex, direction.x * radius, direction.y * radius, direction.z * radius);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { algorithm: "seeded-displaced-uv-sphere", seed: `${DEFAULT_SEED}:rock-geometry:${index}` };
  return geometry;
}

function createRocks() {
  const root = new THREE.Group();
  root.name = "Harbor rock cluster";
  const colors = [0x766f66, 0x8b7f70, 0x625f59];
  const positions = [[-0.85, 0.22, 0.2], [0.05, 0.35, -0.18], [0.85, 0.18, 0.28], [0.35, 0.12, 0.78]];
  positions.forEach((position, index) => {
    const rock = new THREE.Mesh(createRockGeometry(index), material(colors[index % colors.length], { roughness: 0.94 }));
    rock.name = `Rock ${index + 1}`;
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

export function buildAssetGroups(terrain = defaultTerrain()) {
  return {
    boat: createBoat(),
    fish: createFish(),
    rocks: createRocks(),
    sand: createTerrainGroup(terrain, material),
    star: createStar(),
  };
}

function geometryStats(root) {
  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let invalidValueCount = 0;
  const meshTriangleCounts = [];
  let meshesWithNormals = 0;
  let meshesWithUvs = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    meshCount += 1;
    const position = object.geometry.getAttribute("position");
    const normal = object.geometry.getAttribute("normal");
    const uv = object.geometry.getAttribute("uv");
    if (position) {
      vertexCount += position.count;
      for (let index = 0; index < position.array.length; index += 1) {
        if (!Number.isFinite(position.array[index])) invalidValueCount += 1;
      }
    }
    const meshTriangles = object.geometry.index ? object.geometry.index.count / 3 : (position?.count ?? 0) / 3;
    triangleCount += meshTriangles;
    meshTriangleCounts.push(Math.round(meshTriangles));
    if (normal?.count === position?.count) meshesWithNormals += 1;
    if (uv?.count === position?.count) meshesWithUvs += 1;
  });
  return {
    meshCount,
    vertexCount,
    triangleCount: Math.round(triangleCount),
    meshTriangleCounts,
    meshesWithNormals,
    meshesWithUvs,
    invalidValueCount,
  };
}

export function validate(result) {
  const checks = [];
  const artifact = result?.artifact;
  checks.push({ id: "artifact-shape", pass: artifact?.schema === "crimson-harbor/factory-artifact/2" });
  checks.push({ id: "semantic-signature", pass: result?.semanticSignature === `fnv1a:${hashText(stableStringify(artifact))}` });
  checks.push({ id: "coral-count", pass: artifact?.world?.placements?.coral?.length === artifact?.params?.coralCount });
  checks.push({ id: "fish-count", pass: artifact?.world?.placements?.fish?.length === artifact?.params?.fishCount });
  checks.push({ id: "rock-count", pass: artifact?.world?.placements?.rocks?.length === artifact?.params?.rockClusterCount });
  checks.push({ id: "star-count", pass: artifact?.world?.placements?.stars?.length === artifact?.params?.starCount });
  checks.push(...layoutChecks(artifact.world));

  const assets = buildAssetGroups(artifact.world.terrain);
  const assetStats = Object.fromEntries(Object.entries(assets).map(([name, root]) => [name, geometryStats(root)]));
  const textureStats = buildSurfaceTextures(artifact.world.terrain).map(({ fileName, width, height, rgba }) => ({ fileName, width, height, pixels: rgba.length / 4 }));
  checks.push({ id: "finite-geometry", pass: Object.values(assetStats).every((stats) => stats.invalidValueCount === 0 && stats.triangleCount > 0) });
  checks.push({
    id: "rock-mesh-triangle-range",
    pass: assetStats.rocks.meshTriangleCounts.length === 4
      && assetStats.rocks.meshTriangleCounts.every((count) => count >= ROCK_TRIANGLE_MINIMUM && count <= ROCK_TRIANGLE_MAXIMUM),
  });
  checks.push({ id: "rock-normal-and-uv-attributes", pass: assetStats.rocks.meshesWithNormals === 4 && assetStats.rocks.meshesWithUvs === 4 });
  checks.push({ id: "sand-terrain", pass: assetStats.sand.meshCount === 1 && assetStats.sand.triangleCount === TERRAIN_SEGMENTS * TERRAIN_SEGMENTS * 2 && assetStats.sand.meshesWithUvs === 1 });
  checks.push({ id: "surface-texture-dimensions", pass: textureStats.length === 6 && textureStats.every((texture) => texture.width === TERRAIN_TEXTURE_SIZE && texture.height === TERRAIN_TEXTURE_SIZE) });
  checks.push({ id: "triangle-budget", pass: Object.values(assetStats).reduce((total, stats) => total + stats.triangleCount, 0) < 50000 });
  return {
    valid: checks.every((check) => check.pass),
    authority: "Independent structural checks over generated result and Three.js BufferGeometry",
    checks,
    assetStats,
    textureStats,
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
  const groups = buildAssetGroups(result.artifact.world.terrain);
  const files = [];
  for (const [name, root] of Object.entries(groups)) {
    const output = await exportGlb(root);
    files.push({ fileName: `${name}.glb`, mediaType: "model/gltf-binary", bytes: new Uint8Array(output) });
  }

  for (const texture of buildSurfaceTextures(result.artifact.world.terrain)) {
    files.push({
      fileName: texture.fileName,
      mediaType: "image/png",
      bytes: await encodePng(texture.width, texture.height, texture.rgba),
      width: texture.width,
      height: texture.height,
      colorSpace: texture.colorSpace,
    });
  }

  const world = {
    schema: "crimson-harbor/world/3",
    factory: { id: FACTORY_ID, version: FACTORY_VERSION, semanticSignature: result.semanticSignature },
    seed: result.artifact.seed,
    assets: result.artifact.assets,
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
