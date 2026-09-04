import test from "node:test";
import assert from "node:assert/strict";
import { buildAssetGroups, buildSurfaceTextures, exportFactory, generate, randomize, reroll, validate } from "../src/factory.mjs";
import { heightAt, slopeDegreesAt } from "../src/terrain.mjs";

const request = {
  seed: "crimson-harbor-604",
  params: { coralCount: 42, fishCount: 18, rockClusterCount: 48, starCount: 6, worldRadius: 11, waterClarity: 0.8 },
};

test("fixed inputs reproduce the same semantic signature", () => {
  assert.equal(generate(request).semanticSignature, generate(request).semanticSignature);
});

test("randomize stays inside contract ranges", () => {
  const first = randomize({ seed: "bounded" });
  const second = randomize({ seed: "bounded" });
  assert.deepEqual(first, second);
  assert.ok(first.params.coralCount >= 8 && first.params.coralCount <= 42);
  assert.ok(first.params.fishCount >= 4 && first.params.fishCount <= 18);
  assert.ok(first.params.rockClusterCount >= 2 && first.params.rockClusterCount <= 48);
  assert.ok(first.params.starCount >= 3 && first.params.starCount <= 6);
  assert.ok(first.params.waterClarity >= 0.55 && first.params.waterClarity <= 0.92);
});

test("reroll changes the seed and preserves normalized parameters", () => {
  const result = reroll({ ...request, stream: "fish-placement" });
  assert.notEqual(result.seed, request.seed);
  assert.deepEqual(result.params, request.params);
});

test("invalid parameters and blocked sources stop generation", () => {
  assert.throws(() => generate({ ...request, params: { ...request.params, fishCount: 50 } }), /fishCount/);
  assert.throws(() => generate({ ...request, sourceReady: false }), /blocked/);
});

test("validator rejects a changed artifact", () => {
  const result = generate(request);
  result.artifact.world.placements.fish.pop();
  assert.equal(validate(result).valid, false);
});

test("rocks and surface textures meet the fidelity contract", () => {
  const rocks = buildAssetGroups().rocks.children.filter((object) => object.isMesh);
  assert.equal(rocks.length, 4);
  for (const rock of rocks) {
    const triangles = rock.geometry.index.count / 3;
    assert.ok(triangles >= 500 && triangles <= 1000);
    assert.equal(rock.geometry.getAttribute("normal").count, rock.geometry.getAttribute("position").count);
    assert.equal(rock.geometry.getAttribute("uv").count, rock.geometry.getAttribute("position").count);
  }
  const textures = buildSurfaceTextures(generate(request).artifact.world.terrain);
  assert.equal(textures.length, 6);
  assert.ok(textures.every((texture) => texture.width === 256 && texture.height === 256));
});

test("heightfield and curve layout are bounded and deterministic", () => {
  const first = generate(request).artifact.world;
  const second = generate(request).artifact.world;
  assert.deepEqual(first.terrain, second.terrain);
  assert.deepEqual(first.curves, second.curves);
  assert.deepEqual(first.placements, second.placements);
  assert.equal(first.placements.rocks.length, 48);
  assert.equal(first.placements.coral.length, 42);
  assert.equal(first.placements.fish.length, 18);
  assert.equal(first.placements.stars.length, 6);
  for (const record of [...first.placements.rocks, ...first.placements.coral]) {
    assert.ok(record.position[1] >= first.terrain.minimumY);
    assert.ok(record.position[1] <= first.terrain.maximumY + 0.04);
    assert.ok(slopeDegreesAt(first.terrain, record.position[0], record.position[2]) < 45);
  }
  assert.ok(heightAt(first.terrain, 0, 0) < first.water.y - 0.35);
});

test("quality profiles are stable prefixes", () => {
  const world = generate(request).artifact.world;
  assert.deepEqual(world.placements.rocks.slice(0, world.qualityCounts.low.rocks), world.placements.rocks.slice(0, 20));
  assert.deepEqual(world.placements.coral.slice(0, world.qualityCounts.auto.coral), world.placements.coral.slice(0, 30));
  assert.equal(world.qualityCounts.high.fish, 18);
});

test("GLB export is reproducible", async () => {
  const result = generate(request);
  const first = await exportFactory(result);
  const second = await exportFactory(result);
  assert.deepEqual(first.files.map((file) => file.fileName), second.files.map((file) => file.fileName));
  for (let index = 0; index < first.files.length; index += 1) {
    const a = first.files[index];
    const b = second.files[index];
    if (a.bytes) assert.deepEqual(a.bytes, b.bytes);
    else assert.equal(a.text, b.text);
  }
});
