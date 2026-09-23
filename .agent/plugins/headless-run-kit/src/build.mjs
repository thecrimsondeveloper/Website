import { spawn } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

export async function buildTarget(info) {
  if (!info.hasPackageJson || !info.scripts.build) return { attempted: false, status: 'skipped' };
  const command = info.packageManager === 'npm' ? 'npm' : info.packageManager;
  const args = info.packageManager === 'npm' ? ['run', 'build'] : ['build'];
  await runCommand(command, args, { cwd: info.target, env: process.env });
  return { attempted: true, status: 'pass' };
}
