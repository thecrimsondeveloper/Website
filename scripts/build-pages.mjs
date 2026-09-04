import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(projectRoot, "out");
const pagesDirectory = join(projectRoot, "docs");
const nextCli = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const basePath = "/Website";

const build = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  stdio: "inherit",
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const outputIndex = join(outputDirectory, "index.html");

if (!existsSync(outputIndex)) {
  throw new Error("Next.js did not generate out/index.html.");
}

rmSync(pagesDirectory, { recursive: true, force: true });
mkdirSync(pagesDirectory, { recursive: true });
cpSync(outputDirectory, pagesDirectory, { recursive: true });
writeFileSync(join(pagesDirectory, ".nojekyll"), "");

const pagesIndex = join(pagesDirectory, "index.html");
const html = readFileSync(pagesIndex, "utf8");

if (!html.includes(`${basePath}/_next/`)) {
  throw new Error(`docs/index.html is missing the ${basePath} asset prefix.`);
}

console.log(`GitHub Pages build ready: ${pagesIndex}`);
