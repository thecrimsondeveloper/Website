#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { inspectTarget } from '../src/inspect.mjs';
import { buildTarget } from '../src/build.mjs';
import { serveDirectory } from '../src/serve.mjs';
import { findChromium, launchBrowser } from '../src/browser.mjs';
import { readWebGL } from '../src/webgl.mjs';
import { captureViews } from '../src/capture.mjs';
import { validate } from '../src/validate.mjs';

function argsOf(argv) {
  const out = { target: '.', url: '/', views: 'desktop,tablet,mobile', webgl: false, lavapipe: false, fullPage: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--webgl') out.webgl = true;
    else if (arg === '--lavapipe') out.lavapipe = true;
    else if (arg === '--full-page') out.fullPage = true;
    else if (arg.startsWith('--')) out[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return out;
}

const args = argsOf(process.argv.slice(2));
const target = path.resolve(args.target);
const kitRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const output = path.resolve(args.output || path.join(target, 'evidence/headless-run'));
fs.mkdirSync(output, { recursive: true });
const viewports = JSON.parse(fs.readFileSync(path.join(kitRoot, 'config/viewports.json'), 'utf8'));
const info = inspectTarget(target);
const environment = { node: process.version, platform: process.platform, arch: process.arch, chromium: findChromium(args.chrome), lavapipeRequested: args.lavapipe, vkIcd: process.env.VK_ICD_FILENAMES ?? null, softwareGL: process.env.LIBGL_ALWAYS_SOFTWARE ?? null };
fs.writeFileSync(path.join(output, 'environment.json'), JSON.stringify(environment, null, 2));

let build = { attempted: false, status: 'skipped' };
let server = null;
let browser = null;
const consoleLines = [];
let fatalError = null;
try {
  build = await buildTarget(info);
  let baseUrl = args.baseUrl;
  if (!baseUrl) {
    const served = await serveDirectory(target, Number(args.port || 0));
    server = served.server;
    baseUrl = `http://127.0.0.1:${served.port}`;
  }
  if (!environment.chromium) throw new Error('Chromium/Chrome executable not found');
  browser = await launchBrowser({ executablePath: environment.chromium, lavapipe: args.lavapipe });
  const captures = await captureViews(browser, { baseUrl, route: args.url, viewports, names: args.views.split(',').map(x => x.trim()).filter(Boolean), output, fullPage: args.fullPage, consoleLines });
  const renderer = args.webgl ? await readWebGL(captures[0].page) : { available: null, required: false };
  fs.writeFileSync(path.join(output, 'renderer.json'), JSON.stringify(renderer, null, 2));
  for (const capture of captures) await capture.page.close();
  const tiles = [];
  for (let i = 0; i < captures.length; i += 1) {
    const tile = await sharp(captures[i].file).resize(480, 320, { fit: 'contain', background: '#111' }).png().toBuffer();
    tiles.push({ input: tile, left: i * 480, top: 0 });
  }
  await sharp({ create: { width: 480 * captures.length, height: 320, channels: 4, background: '#111' } }).composite(tiles).png().toFile(path.join(output, 'contact-sheet.png'));
  const validation = validate({ build, captures, webglRequired: args.webgl, renderer, fatalError });
  const report = { ...validation, target, baseUrl, build, renderer, captures: captures.map(({ page, ...rest }) => rest) };
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'browser-console.log'), `${consoleLines.join('\n')}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (validation.status !== 'pass') process.exitCode = 1;
} catch (error) {
  fatalError = error;
  const report = { status: 'fail', error: error.stack || error.message, target, build };
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'browser-console.log'), `${consoleLines.join('\n')}\n`);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
