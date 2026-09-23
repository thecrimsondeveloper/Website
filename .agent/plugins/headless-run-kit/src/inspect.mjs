import fs from 'node:fs';
import path from 'node:path';

export function inspectTarget(target) {
  const pkgPath = path.join(target, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : null;
  const files = fs.existsSync(target) ? fs.readdirSync(target) : [];
  const packageManager = fs.existsSync(path.join(target, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(target, 'yarn.lock')) ? 'yarn' : 'npm';
  return {
    target,
    packageManager,
    packageName: pkg?.name ?? null,
    scripts: pkg?.scripts ?? {},
    likelyStatic: files.includes('index.html'),
    hasPackageJson: Boolean(pkg),
  };
}
