import * as THREE from "three";

export const TERRAIN_TEXTURE_SIZE = 256;
export const TERRAIN_SEGMENTS = 128;
export const TERRAIN_MIN_Y = -3.05;
export const TERRAIN_MAX_Y = -1.45;
export const TERRAIN_BASE_Y = -2.5;

const compiledCache = new WeakMap();

function hashText(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededPhase(seed, name) {
  return (hashText(`${seed}:${name}`) / 0xffffffff) * Math.PI * 2;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function compile(terrain) {
  if (compiledCache.has(terrain)) return compiledCache.get(terrain);
  const ridges = terrain.ridges.map((definition) => {
    const points = definition.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(points, definition.closed, "centripetal", 0.5);
    return {
      width: definition.width,
      lift: definition.lift,
      points: curve.getSpacedPoints(48).map((point) => [point.x, point.z]),
    };
  });
  const result = {
    phaseA: seededPhase(terrain.seed, "terrain-broad-a"),
    phaseB: seededPhase(terrain.seed, "terrain-broad-b"),
    phaseC: seededPhase(terrain.seed, "terrain-ripples"),
    ridges,
  };
  compiledCache.set(terrain, result);
  return result;
}

function distanceToSamples(x, z, samples) {
  let closestSquared = Number.POSITIVE_INFINITY;
  for (const [sampleX, sampleZ] of samples) {
    const dx = x - sampleX;
    const dz = z - sampleZ;
    closestSquared = Math.min(closestSquared, dx * dx + dz * dz);
  }
  return Math.sqrt(closestSquared);
}

export function createTerrainDefinition(seed, worldRadius, curves) {
  return {
    schema: "crimson-harbor/terrain/1",
    seed,
    radius: worldRadius + 5,
    baseY: TERRAIN_BASE_Y,
    minimumY: TERRAIN_MIN_Y,
    maximumY: TERRAIN_MAX_Y,
    textureSize: TERRAIN_TEXTURE_SIZE,
    segments: TERRAIN_SEGMENTS,
    ridges: curves.coral.map((curve) => ({
      id: `ridge:${curve.id}`,
      controlPoints: curve.controlPoints.map(([x, , z]) => [x, z]),
      closed: curve.closed,
      width: curve.width * 1.2,
      lift: 0.2 + (curve.index % 2) * 0.07,
    })),
  };
}

export function heightAt(terrain, x, z) {
  const compiled = compile(terrain);
  const radius = Math.hypot(x, z);
  const normalizedRadius = radius / terrain.radius;
  const basin = -0.18 * (1 - smoothstep(0.1, 0.46, normalizedRadius));
  const shelf = smoothstep(0.28, 0.92, normalizedRadius) * 0.52;
  const broad = (
    Math.sin(x * 0.31 + compiled.phaseA) * Math.cos(z * 0.27 - compiled.phaseB) * 0.09
    + Math.sin((x + z) * 0.18 + compiled.phaseB) * 0.05
  );
  const ripples = (
    Math.sin(x * 2.35 + z * 0.42 + compiled.phaseC) * 0.032
    + Math.sin(x * 4.7 - z * 0.84 + compiled.phaseA) * 0.013
  );
  let ridgeLift = 0;
  for (const ridge of compiled.ridges) {
    const distance = distanceToSamples(x, z, ridge.points);
    const normalized = distance / Math.max(ridge.width, 0.001);
    ridgeLift = Math.max(ridgeLift, Math.exp(-(normalized * normalized) * 2.35) * ridge.lift);
  }
  const edgeDrop = smoothstep(0.91, 1.08, normalizedRadius) * 0.23;
  return clamp(terrain.baseY + basin + shelf + broad + ripples + ridgeLift - edgeDrop, terrain.minimumY, terrain.maximumY);
}

export function normalAt(terrain, x, z, step = 0.12) {
  const left = heightAt(terrain, x - step, z);
  const right = heightAt(terrain, x + step, z);
  const down = heightAt(terrain, x, z - step);
  const up = heightAt(terrain, x, z + step);
  return new THREE.Vector3(left - right, step * 2, down - up).normalize();
}

export function slopeDegreesAt(terrain, x, z) {
  const normal = normalAt(terrain, x, z);
  return THREE.MathUtils.radToDeg(Math.acos(clamp(normal.y, -1, 1)));
}

export function createTerrainGeometry(terrain) {
  const segments = terrain.segments;
  const verticesPerSide = segments + 1;
  const positions = new Float32Array(verticesPerSide * verticesPerSide * 3);
  const uvs = new Float32Array(verticesPerSide * verticesPerSide * 2);
  const indices = [];
  let vertexOffset = 0;
  let uvOffset = 0;

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const normalizedZ = v * 2 - 1;
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const normalizedX = u * 2 - 1;
      const x = normalizedX * terrain.radius;
      const z = normalizedZ * terrain.radius;
      positions[vertexOffset] = normalizedX;
      positions[vertexOffset + 1] = heightAt(terrain, x, z) - terrain.baseY;
      positions[vertexOffset + 2] = normalizedZ;
      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
      vertexOffset += 3;
      uvOffset += 2;
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * verticesPerSide + column;
      const b = a + 1;
      const c = a + verticesPerSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    algorithm: "seeded-heightfield-grid",
    seed: terrain.seed,
    segments,
    radius: terrain.radius,
    minimumY: terrain.minimumY,
    maximumY: terrain.maximumY,
  };
  return geometry;
}

function rgbaTexture(size, pixel) {
  const rgba = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    const v = row / (size - 1);
    for (let column = 0; column < size; column += 1) {
      const u = column / (size - 1);
      const color = pixel(u, v);
      const offset = (row * size + column) * 4;
      rgba[offset] = clamp(Math.round(color[0]), 0, 255);
      rgba[offset + 1] = clamp(Math.round(color[1]), 0, 255);
      rgba[offset + 2] = clamp(Math.round(color[2]), 0, 255);
      rgba[offset + 3] = color[3] ?? 255;
    }
  }
  return rgba;
}

export function buildTerrainTextures(terrain) {
  const size = terrain.textureSize;
  const sample = (u, v) => {
    const x = (u * 2 - 1) * terrain.radius;
    const z = (v * 2 - 1) * terrain.radius;
    return { x, z, height: heightAt(terrain, x, z) };
  };
  const heightRange = terrain.maximumY - terrain.minimumY;
  const height = rgbaTexture(size, (u, v) => {
    const level = ((sample(u, v).height - terrain.minimumY) / heightRange) * 255;
    return [level, level, level, 255];
  });
  const normal = rgbaTexture(size, (u, v) => {
    const point = sample(u, v);
    const value = normalAt(terrain, point.x, point.z, (terrain.radius * 2) / size);
    return [(value.x * 0.5 + 0.5) * 255, (value.z * 0.5 + 0.5) * 255, (value.y * 0.5 + 0.5) * 255, 255];
  });
  const albedo = rgbaTexture(size, (u, v) => {
    const point = sample(u, v);
    const normalized = (point.height - terrain.minimumY) / heightRange;
    const grain = Math.sin((u * 71 + v * 53) * Math.PI * 2) * 3.2;
    return [174 + normalized * 42 + grain, 151 + normalized * 38 + grain * 0.75, 105 + normalized * 31 + grain * 0.45, 255];
  });
  const ao = rgbaTexture(size, (u, v) => {
    const point = sample(u, v);
    const step = (terrain.radius * 2) / size;
    const surrounding = (
      heightAt(terrain, point.x - step, point.z)
      + heightAt(terrain, point.x + step, point.z)
      + heightAt(terrain, point.x, point.z - step)
      + heightAt(terrain, point.x, point.z + step)
    ) * 0.25;
    const cavity = clamp((surrounding - point.height) * 3.8, 0, 0.35);
    const level = (1 - cavity) * 255;
    return [level, level, level, 255];
  });
  return [
    { fileName: "textures/terrain-height.png", width: size, height: size, rgba: height, colorSpace: "linear" },
    { fileName: "textures/sand-normal.png", width: size, height: size, rgba: normal, colorSpace: "linear" },
    { fileName: "textures/sand-albedo.png", width: size, height: size, rgba: albedo, colorSpace: "srgb" },
    { fileName: "textures/terrain-ao.png", width: size, height: size, rgba: ao, colorSpace: "linear" },
  ];
}

export function createTerrainGroup(terrain, materialFactory) {
  const root = new THREE.Group();
  root.name = "Deterministic harbor heightfield";
  const mesh = new THREE.Mesh(
    createTerrainGeometry(terrain),
    materialFactory(0xc9b58f, { roughness: 0.96, metalness: 0 }),
  );
  mesh.name = "Sand heightfield terrain";
  root.add(mesh);
  return root;
}
