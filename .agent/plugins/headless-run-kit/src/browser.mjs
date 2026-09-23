import fs from 'node:fs';
import { chromium } from 'playwright-core';

export function findChromium(explicit) {
  const candidates = [explicit, process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

export async function launchBrowser({ executablePath, lavapipe = false }) {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (lavapipe) args.push('--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist');
  return chromium.launch({ headless: true, executablePath, args, env: process.env });
}
