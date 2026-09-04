import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssetGroups } from "../src/factory.mjs";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rocks = buildAssetGroups().rocks;
const tolerance = 1e-5;

function positionKey(position, index) {
  return [position.getX(index), position.getY(index), position.getZ(index)]
    .map((value) => Math.round(value / tolerance))
    .join(":");
}

function inspectRock(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const sourceIndex = geometry.index?.array || Array.from({ length: position.count }, (_, index) => index);
  const weldedByKey = new Map();
  const welded = Array.from({ length: position.count }, (_, index) => {
    const key = positionKey(position, index);
    if (!weldedByKey.has(key)) weldedByKey.set(key, weldedByKey.size);
    return weldedByKey.get(key);
  });
  const edges = new Map();
  const adjacency = new Map();
  let degenerateTriangles = 0;
  let invalidValues = 0;

  for (const value of position.array) if (!Number.isFinite(value)) invalidValues += 1;

  function addEdge(a, b) {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const key = `${low}:${high}`;
    const edge = edges.get(key) || { count: 0, balance: 0 };
    edge.count += 1;
    edge.balance += a < b ? 1 : -1;
    edges.set(key, edge);
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }

  for (let index = 0; index < sourceIndex.length; index += 3) {
    const a = welded[sourceIndex[index]];
    const b = welded[sourceIndex[index + 1]];
    const c = welded[sourceIndex[index + 2]];
    if (a === b || b === c || c === a) {
      degenerateTriangles += 1;
      continue;
    }
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  let components = 0;
  const visited = new Set();
  for (const vertex of adjacency.keys()) {
    if (visited.has(vertex)) continue;
    components += 1;
    const pending = [vertex];
    visited.add(vertex);
    while (pending.length) {
      for (const neighbor of adjacency.get(pending.pop()) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
  }

  const edgeValues = [...edges.values()];
  const triangles = sourceIndex.length / 3;
  const signature = crypto.createHash("sha256")
    .update(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength))
    .update(Buffer.from(sourceIndex.buffer, sourceIndex.byteOffset, sourceIndex.byteLength))
    .digest("hex");

  return {
    name: mesh.name,
    vertices: position.count,
    weldedVertices: weldedByKey.size,
    triangles,
    degenerateTriangles,
    boundaryEdges: edgeValues.filter((edge) => edge.count === 1).length,
    nonManifoldEdges: edgeValues.filter((edge) => edge.count > 2).length,
    windingErrors: edgeValues.filter((edge) => edge.count === 2 && edge.balance !== 0).length,
    components,
    invalidValues,
    normalsValid: normal?.count === position.count,
    uvsValid: uv?.count === position.count,
    signature: `sha256:${signature}`,
  };
}

const results = rocks.children.filter((object) => object.isMesh).map(inspectRock);
const pass = results.length === 4 && results.every((rock) => (
  rock.triangles >= 500
  && rock.triangles <= 1000
  && rock.degenerateTriangles === 0
  && rock.boundaryEdges === 0
  && rock.nonManifoldEdges === 0
  && rock.windingErrors === 0
  && rock.components === 1
  && rock.invalidValues === 0
  && rock.normalsValid
  && rock.uvsValid
));

const report = {
  schemaVersion: "mesh-integrity/1",
  asset: "rocks.glb source geometry",
  algorithm: "seeded-displaced-uv-sphere",
  tolerance,
  requiredTriangleRange: [500, 1000],
  rocks: results,
  verdict: pass ? "pass" : "fail",
};

fs.writeFileSync(path.join(kitRoot, "evidence/rock-mesh-integrity.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!pass) process.exitCode = 1;
