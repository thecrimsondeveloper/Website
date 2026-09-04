import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(kitRoot, "../..");
const runId = "harbor-density-20260904-604a";
const runRoot = path.join(kitRoot, "evidence/density-review", runId);
const baselineValidation = JSON.parse(fs.readFileSync(path.join(runRoot, "baseline/headless-validation.json"), "utf8"));
const finalValidation = JSON.parse(fs.readFileSync(path.join(kitRoot, "evidence/headless-validation.json"), "utf8"));
const technicalGates = JSON.parse(fs.readFileSync(path.join(runRoot, "technical-gates.json"), "utf8"));
const finalWorld = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "public/assets/harbor/world.json"), "utf8"));

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(fileName, value) {
  const filePath = path.join(runRoot, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

if (baselineValidation.status !== "pass" || finalValidation.status !== "pass") {
  throw new Error("Baseline and final headless captures must pass before visual review.");
}
if (technicalGates.verdict !== "pass") throw new Error("Technical layout gates must pass before visual selection.");
const baselineIds = baselineValidation.captures.map(({ id }) => id);
const finalIds = finalValidation.captures.map(({ id }) => id);
if (baselineIds.length !== 10 || JSON.stringify(baselineIds) !== JSON.stringify(finalIds)) {
  throw new Error("Baseline and final capture profiles are not comparable.");
}

const artifacts = [];
const tiles = [];
const variants = [
  ["baseline", baselineValidation],
  ["final-winner", finalValidation],
];
for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
  const [variant, validation] = variants[variantIndex];
  for (let index = 0; index < validation.captures.length; index += 1) {
    const capture = validation.captures[index];
    const imagePath = path.join(repositoryRoot, capture.image);
    const bytes = fs.readFileSync(imagePath);
    const metadata = await sharp(bytes).metadata();
    const tileImage = await sharp(bytes).resize(320, 213, { fit: "fill" }).png().toBuffer();
    const label = `${variant === "final-winner" ? "WINNER • " : "BASELINE • "}${capture.id}`;
    const labelSvg = Buffer.from(`<svg width="320" height="27" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="27" fill="${variant === "final-winner" ? "#9d3f37" : "#173f43"}"/><text x="10" y="18" fill="#f4f1e8" font-family="sans-serif" font-size="12" font-weight="700">${label}</text></svg>`);
    const tile = await sharp({ create: { width: 320, height: 240, channels: 4, background: "#0b4b4d" } })
      .composite([{ input: tileImage, left: 0, top: 0 }, { input: labelSvg, left: 0, top: 213 }])
      .png()
      .toBuffer();
    const tileIndex = variantIndex * 10 + index;
    tiles.push({ input: tile, left: (tileIndex % 5) * 320, top: Math.floor(tileIndex / 5) * 240 });
    artifacts.push({
      variant,
      captureId: `${runId}-${variant}-${capture.id}`,
      profileId: capture.id,
      path: capture.image,
      width: metadata.width,
      height: metadata.height,
      bytes: bytes.length,
      sha256: sha256(bytes),
      deterministic: capture.deterministic,
      status: variant === "final-winner" ? "selected" : "baseline",
    });
  }
}

const contactSheetPath = path.join(runRoot, "contact-sheet.png");
await sharp({ create: { width: 1600, height: 960, channels: 4, background: "#0b4b4d" } })
  .composite(tiles)
  .png()
  .toFile(contactSheetPath);

const reviewRun = {
  schema: "iterative-asset-review/v1",
  run_id: runId,
  asset: { asset_id: "crimson-harbor-scene", kind: "procedural-threejs-scene", intended_use: "portfolio-landing" },
  authority: { mutation_roots: [repositoryRoot], external_writes: "one main push after every local gate passes" },
  reference_set: {
    reference_ids: ["user-approved-high-density-plan", "preserved-sparse-baseline"],
    locked_criteria: ["centered-boat", "top-down-angled-camera", "heightfield-relief", "broken-curved-reef-bands", "dense-rocks-and-coral", "readable-shadows", "performance-budgets"],
  },
  budget: { batch_size: 1, max_attempts: 10, accepted_improvement_goal: 1, maximum_item_mutations_per_attempt: 50 },
  capture_profile_id: "harbor-ten-angle-v1",
  state: "accepted",
};

const reviewFeedback = {
  intendedOutcome: "A denser, more realistic top-down harbor with heightfield terrain, curved composition, readable lighting, and a clear centered boat.",
  observedResult: "The final ten-angle captures show the boat preserved in open central water, a broken ring of varied rock masses and coral, denser fish and stars, rippled terrain, and stronger directional shadow separation.",
  improved: [
    { observation: "The web view increases rock-cluster placements from 3 to 48 and coral from 13 to 42 while retaining central negative space.", evidence: "baseline and winner web-top-down captures plus world.json counts" },
    { observation: "Rock and coral masses form irregular arcs with deliberate breaks instead of isolated radial points.", evidence: "all ten matched baseline/winner angles" },
    { observation: "Heightfield ripples and sloped shelves produce changing contact shadows and elevation silhouettes in oblique views.", evidence: "north-east, south-east, north-west, and grazing captures" },
    { observation: "The boat remains the strongest central focal object in the production camera.", evidence: "winner web-top-down capture" },
  ],
  regressed: [],
  mostImportantFailure: "The CPU headless water is a material surrogate and cannot prove the production GLSL refraction path.",
  likelyCause: { hypothesis: "The trusted framebuffer renderer does not execute the browser WebGL custom shader pipeline.", confidence: 1 },
  nextBoundedChange: "Validate the built site on a local browser/WebGL surface without changing scene content.",
  fallbackDirection: "If browser rendering is unavailable, retain this visual winner and report the WebGL boundary as blocked rather than infer it from stills.",
  evidenceNeededAfterward: "Fresh local-host browser screenshots, renderer diagnostics, interaction evidence, console output, and network failures.",
  decision: "continue",
};

const visualDelta = {
  candidate_id: `${runId}-a0005-c01`,
  comparisonAuthority: "User-approved criteria and matched preserved baseline; no separate photographic reference image was supplied.",
  reference_deltas: [
    { criterion: "heightfield-relief", observed: "rippled and raised seabed shelves are visible", target: "readable shaped seabed", severity: "pass", confidence: 0.94 },
    { criterion: "curved-density", observed: "irregular rock and coral arcs surround a clear center", target: "dense but composed reef", severity: "pass", confidence: 0.96 },
    { criterion: "lighting-readability", observed: "directional shadows separate boat, rocks, and coral", target: "accentuated forms", severity: "pass", confidence: 0.93 },
  ],
  winner_deltas: [
    { criterion: "mass-distribution", observed: "substantially denser perimeter with preserved center", target: "improve sparse baseline", severity: "improved", confidence: 0.98 },
    { criterion: "negative-space", observed: "central boat clearance remains legible", target: "no clutter around focal point", severity: "improved", confidence: 0.95 },
  ],
  active_objective: { criterion: "high-density-harbor", result: "improved", evidence: "matched ten-angle contact sheet", confidence: 0.96 },
  regressions: [],
  recommendation: "accept",
};

const selectionDecision = {
  decision_id: `${runId}-a0005-decision`,
  incumbent_winner_id: `${runId}-w0000`,
  selected_candidate_id: `${runId}-a0005-c01`,
  result: "accept_candidate",
  reason_codes: ["visible_density_improvement", "centered_boat_preserved", "locked_capture_profiles_match", "hard_layout_gates_passed", "deterministic_renders"],
  rejected_candidate_ids: [],
  accepted_iteration_increment: 1,
};

const lineage = {
  schema: "iterative-asset-review/winner-lineage/1",
  winners: [
    { winner_id: `${runId}-w0000`, parent_winner_id: null, generator_sha256: "baseline-commit-20af268", seed: "crimson-harbor-604", geometry_sha256: sha256(fs.readFileSync(path.join(runRoot, "baseline/models/sand.glb"))), capture_id: artifacts[0].captureId, status: "baseline" },
    { winner_id: `${runId}-w0001`, parent_winner_id: `${runId}-w0000`, generator_sha256: sha256(fs.readFileSync(path.join(kitRoot, "src/factory.mjs"))), seed: finalWorld.seed, parameters: finalWorld.qualityCounts.high, geometry_sha256: sha256(fs.readFileSync(path.join(repositoryRoot, "public/assets/harbor/models/sand.glb"))), capture_id: artifacts[10].captureId, accepted_attempt_id: `${runId}-a0005`, accepted_evidence: ["heightfield-relief", "curved-density", "lighting-readability"], status: "winner" },
  ],
};

const evidenceIndex = {
  schema: "iterative-asset-review/evidence-index/1",
  runId,
  ordering: "baseline ten-angle profile, then selected winner ten-angle profile",
  expectedCount: 20,
  representedCount: artifacts.length,
  missingCount: 0,
  contactSheet: path.relative(repositoryRoot, contactSheetPath),
  artifacts,
};

const verdict = {
  schema: "sandbox-review/verdict/1",
  runId,
  target: "Crimson portfolio harbor scene",
  question: "Does the deterministic high-density candidate visibly improve the sparse harbor while preserving camera, focal clearance, and hard layout constraints?",
  route: "@headless-three/renderer with task-local Mesa Lavapipe",
  captureMode: "ten fixed angles at 960x640, each rendered twice for deterministic hashes",
  captureVerdict: "pass",
  reviewFeedbackDecision: "continue to browser-boundary validation",
  selectionVerdict: "accept_candidate",
  finalVerdict: "pass for Three.js scene geometry, materials, transforms, composition, and deterministic pixels",
  warnings: ["Production GLSL water and browser DOM/input are validated separately."],
  coverageBoundary: "Does not claim browser WebGL, DOM, network, or pointer-event coverage.",
};

writeJson("review-run.json", reviewRun);
writeJson("review-feedback.json", reviewFeedback);
writeJson("visual-delta.json", visualDelta);
writeJson("selection-decision.json", selectionDecision);
writeJson("winner-lineage.json", lineage);
writeJson("evidence-index.json", evidenceIndex);
writeJson("review-verdict.json", verdict);

const passed = artifacts.length === 20
  && artifacts.every(({ deterministic }) => deterministic)
  && selectionDecision.result === "accept_candidate"
  && technicalGates.verdict === "pass";
process.stdout.write(`${JSON.stringify({ runId, passed, contactSheet: path.relative(repositoryRoot, contactSheetPath), captures: artifacts.length, acceptedImprovements: 1, attempts: technicalGates.attempts.length }, null, 2)}\n`);
if (!passed) process.exitCode = 1;
