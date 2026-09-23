import fs from 'node:fs';
import path from 'node:path';

export async function captureViews(browser, { baseUrl, route, viewports, names, output, fullPage = false, consoleLines = [] }) {
  const captures = [];
  for (const name of names) {
    const viewport = viewports[name];
    if (!viewport) throw new Error(`Unknown viewport: ${name}`);
    const page = await browser.newPage({ viewport });
    page.on('console', message => consoleLines.push(`[${name}] ${message.type()}: ${message.text()}`));
    page.on('pageerror', error => consoleLines.push(`[${name}] pageerror: ${error.message}`));
    const response = await page.goto(new URL(route, baseUrl).href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(750);
    const file = path.join(output, `${name}.png`);
    await page.screenshot({ path: file, fullPage });
    captures.push({ name, viewport, file, httpStatus: response?.status() ?? null, bytes: fs.statSync(file).size, page });
  }
  return captures;
}
