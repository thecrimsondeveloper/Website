import * as THREE from "three";
import { heightAt, normalAt, slopeDegreesAt } from "./terrain.mjs";

function hashText(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
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
  return mulberry32(hashText(`${seed}:${name}`));
}

function between(random, minimum, maximum) {
  return minimum + (maximum - minimum) * random();
}

function round(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function point(radius, angle, stretchX = 1, stretchZ = 1) {
  return [round(Math.cos(angle) * radius * stretchX), 0, round(Math.sin(angle) * radius * stretchZ)];
}

function jitterPoints(seed, name, points, amount) {
  const random = stream(seed, `curve:${name}`);
  return points.map(([x, y, z]) => [round(x + between(random, -amount, amount)), y, round(z + between(random, -amount, amount))]);
}

function curveRecord(seed, index, id, points, options = {}) {
  return {
    id,
    index,
    closed: options.closed ?? false,
    width: options.width ?? 1,
    controlPoints: jitterPoints(seed, id, points, options.jitter ?? 0.25),
  };
}

export function createCurveNetwork(seed, worldRadius) {
  const outer = Math.min(worldRadius, 10.8);
  const circular = (radius, count, phase, stretchX = 1, stretchZ = 1) => Array.from(
    { length: count },
    (_, index) => point(radius, phase + (index / count) * Math.PI * 2, stretchX, stretchZ),
  );
  const rock = [
    curveRecord(seed, 0, "rock-outer", circular(outer * 0.88, 9, 0.12, 1.02, 0.92), { closed: true, width: 1.25, jitter: 0.42 }),
    curveRecord(seed, 1, "rock-west", [[-8.6, 0, -6.4], [-9.1, 0, -2], [-8.4, 0, 2.8], [-6.1, 0, 7.2]], { width: 1.1, jitter: 0.38 }),
    curveRecord(seed, 2, "rock-east", [[7.7, 0, 6.7], [8.9, 0, 2.8], [8.2, 0, -1.3], [6.1, 0, -7.3]], { width: 1.05, jitter: 0.38 }),
  ];
  const coral = [
    curveRecord(seed, 0, "coral-north", [[-6.8, 0, 5.6], [-2.5, 0, 7.1], [2.4, 0, 6.8], [6.6, 0, 4.8]], { width: 1.35, jitter: 0.32 }),
    curveRecord(seed, 1, "coral-south", [[-6.4, 0, -5.2], [-2.4, 0, -7.3], [2.3, 0, -6.6], [6.9, 0, -4.4]], { width: 1.3, jitter: 0.32 }),
    curveRecord(seed, 2, "coral-west", [[-7.7, 0, -3.5], [-6.4, 0, -0.2], [-6.8, 0, 3.7]], { width: 1.1, jitter: 0.28 }),
    curveRecord(seed, 3, "coral-east", [[6.9, 0, 4.1], [6.2, 0, 0.5], [7.5, 0, -3.2]], { width: 1.1, jitter: 0.28 }),
  ];
  const fish = [
    curveRecord(seed, 0, "fish-inner", circular(4.5, 7, 0.25, 1.18, 0.74), { closed: true, width: 0.5, jitter: 0.22 }),
    curveRecord(seed, 1, "fish-middle", circular(6.4, 8, -0.2, 0.9, 1.06), { closed: true, width: 0.65, jitter: 0.28 }),
    curveRecord(seed, 2, "fish-outer", circular(8.2, 9, 0.46, 1.04, 0.82), { closed: true, width: 0.75, jitter: 0.34 }),
  ].map((curve, index) => ({ ...curve, depth: -0.78 - index * 0.28 }));
  return { schema: "crimson-harbor/curves/1", rock, coral, fish };
}

export function compileCurve(definition) {
  return new THREE.CatmullRomCurve3(
    definition.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    definition.closed,
    "centripetal",
    0.5,
  );
}

function terrainRotation(terrain, x, z, yaw, maximumTiltDegrees) {
  const normal = normalAt(terrain, x, z);
  const tilt = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, normal.y))));
  if (tilt > maximumTiltDegrees) {
    normal.lerp(new THREE.Vector3(0, 1, 0), 1 - maximumTiltDegrees / tilt).normalize();
  }
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const heading = new THREE.Quaternion().setFromAxisAngle(normal, yaw);
  const euler = new THREE.Euler().setFromQuaternion(heading.multiply(align), "XYZ");
  return [round(euler.x), round(euler.y), round(euler.z)];
}

function offsetAlongCurve(curve, definition, t, offset) {
  const position = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  position.addScaledVector(normal, offset);
  return { position, tangent };
}

function buildCurvePlacements({ seed, name, count, maximumCount, curves, terrain, create, minimumDistance }) {
  const random = stream(seed, `${name}-placement`);
  const compiled = curves.map(compileCurve);
  const records = [];
  for (let index = 0; index < maximumCount; index += 1) {
    const curveIndex = index % curves.length;
    const definition = curves[curveIndex];
    const curve = compiled[curveIndex];
    const lane = Math.floor(index / curves.length);
    const laneCount = Math.ceil(maximumCount / curves.length);
    const baseT = (lane + 0.28) / laneCount + curveIndex * 0.11;
    let accepted = null;
    let best = null;
    let bestClearance = Number.NEGATIVE_INFINITY;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const retryOffset = attempt === 0 ? 0 : attempt * 0.137507764;
      let t = ((baseT + retryOffset + between(random, -0.012, 0.012)) % 1 + 1) % 1;
      const gap = (t > 0.42 && t < 0.5) || (curveIndex === 0 && t > 0.78 && t < 0.84);
      if (gap) t = (t + 0.09) % 1;
      const offset = between(random, -definition.width, definition.width);
      const sample = offsetAlongCurve(curve, definition, t, offset);
      const candidate = create({ index, random, curveIndex, definition, t, offset, sample });
      const distances = records.map((record) => Math.hypot(
        candidate.position[0] - record.position[0],
        candidate.position[2] - record.position[2],
      ) - minimumDistance(candidate, record));
      const clearance = distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
      if (clearance > bestClearance) {
        best = candidate;
        bestClearance = clearance;
      }
      if (clearance >= 0) {
        accepted = candidate;
        break;
      }
    }
    records.push(accepted || best);
  }
  return records.slice(0, count);
}

export function buildPlacements(seed, params, terrain, curves, coralAssets) {
  const rocks = buildCurvePlacements({
    seed,
    name: "rock",
    count: params.rockClusterCount,
    maximumCount: 48,
    curves: curves.rock,
    terrain,
    minimumDistance: (left, right) => (left.scale + right.scale) * 0.78 + 0.12,
    create: ({ index, random, definition, t, offset, sample }) => {
      let scale;
      let sizeClass;
      if (index < 8) {
        sizeClass = "large";
        scale = between(random, 0.76, 1.08);
      } else if (index < 24) {
        sizeClass = "medium";
        scale = between(random, 0.43, 0.7);
      } else {
        sizeClass = "small";
        scale = between(random, 0.2, 0.4);
      }
      const x = sample.position.x;
      const z = sample.position.z;
      const yaw = between(random, 0, Math.PI * 2);
      return {
        id: `rocks-${String(index + 1).padStart(2, "0")}`,
        asset: "rocks.glb",
        curveId: definition.id,
        curveT: round(t),
        laneOffset: round(offset),
        sizeClass,
        priority: round(1 - index / 64),
        position: [round(x), round(heightAt(terrain, x, z) + 0.015), round(z)],
        rotation: terrainRotation(terrain, x, z, yaw, sizeClass === "small" ? 24 : 16),
        scale: round(scale),
      };
    },
  });

  const coral = buildCurvePlacements({
    seed,
    name: "coral",
    count: params.coralCount,
    maximumCount: 42,
    curves: curves.coral,
    terrain,
    minimumDistance: (left, right) => (left.scale + right.scale) * 0.82 + 0.18,
    create: ({ index, random, definition, t, offset, sample }) => {
      const x = sample.position.x;
      const z = sample.position.z;
      const slope = slopeDegreesAt(terrain, x, z);
      const scaleBias = index < 12 ? 0.12 : 0;
      return {
        id: `coral-${String(index + 1).padStart(2, "0")}`,
        asset: coralAssets[index % coralAssets.length],
        curveId: definition.id,
        curveT: round(t),
        laneOffset: round(offset),
        priority: round(1 - index / 58),
        position: [round(x), round(heightAt(terrain, x, z) + 0.02), round(z)],
        rotation: terrainRotation(terrain, x, z, between(random, 0, Math.PI * 2), 18),
        scale: round(between(random, 0.24 + scaleBias, 0.5 + scaleBias)),
        swayPhase: round(between(random, 0, Math.PI * 2)),
        slope: round(slope),
      };
    },
  });

  const fish = buildCurvePlacements({
    seed,
    name: "fish",
    count: params.fishCount,
    maximumCount: 18,
    curves: curves.fish,
    terrain,
    minimumDistance: () => 0.4,
    create: ({ index, random, definition, t, offset, sample }) => ({
      id: `fish-${String(index + 1).padStart(2, "0")}`,
      asset: "fish.glb",
      routeId: definition.id,
      curveT: round(t),
      laneOffset: round(offset * 0.3),
      priority: round(1 - index / 28),
      position: [round(sample.position.x), round(definition.depth), round(sample.position.z)],
      rotation: [0, round(Math.atan2(-sample.tangent.z, sample.tangent.x)), 0],
      scale: round(between(random, 0.28, 0.48)),
      speed: round(between(random, 0.025, 0.052)),
      phase: round(between(random, 0, 1)),
      bobPhase: round(between(random, 0, Math.PI * 2)),
    }),
  });

  const starRandom = stream(seed, "star-placement");
  const anchors = [[-4.8, 2.9], [5.2, 1.4], [3.8, -4.4], [-3.9, -4.8], [6.1, -3], [-6.2, 0.4]];
  const stars = anchors.slice(0, params.starCount).map(([anchorX, anchorZ], index) => ({
    id: `star-${index + 1}`,
    asset: "star.glb",
    priority: round(1 - index / 10),
    position: [round(anchorX + between(starRandom, -0.25, 0.25)), 0.72, round(anchorZ + between(starRandom, -0.25, 0.25))],
    rotation: [Math.PI / 2, 0, round(between(starRandom, 0, Math.PI * 2))],
    scale: round(between(starRandom, 0.44, 0.57)),
    phase: round(between(starRandom, 0, Math.PI * 2)),
  }));

  return { coral, rocks, fish, stars };
}

export function layoutChecks(world) {
  const placements = world.placements;
  const all = Object.values(placements).flat();
  const uniqueIds = new Set(all.map((record) => record.id));
  const centralClearance = [...placements.rocks, ...placements.coral].every(({ position }) => Math.hypot(position[0], position[2]) >= 3.4);
  const terrainBounds = [...placements.rocks, ...placements.coral].every(({ position }) => (
    position[1] >= world.terrain.minimumY - 0.01 && position[1] <= world.terrain.maximumY + 0.04
  ));
  const fishClearance = placements.fish.every(({ position }) => (
    position[1] > heightAt(world.terrain, position[0], position[2]) + 0.28 && position[1] < world.water.y - 0.18
  ));
  return [
    { id: "unique-placement-ids", pass: uniqueIds.size === all.length, value: uniqueIds.size },
    { id: "boat-clearance", pass: centralClearance, minimumRadius: 3.4 },
    { id: "terrain-placement-bounds", pass: terrainBounds },
    { id: "fish-terrain-and-surface-clearance", pass: fishClearance },
  ];
}
