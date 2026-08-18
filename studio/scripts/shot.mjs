#!/usr/bin/env node
/**
 * Build + serve the Studio Vite app, screenshot each plugin frame → website/images/.
 *
 *   npm run shot
 *   npm run shot -- plugin=reverb
 *   npm run shot -- reverb
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(__dirname, '..');
const ROOT = path.resolve(STUDIO, '..');
const OUT_DIR = path.resolve(ROOT, 'website/images');
const PORT = 5174;
const BASE = `http://127.0.0.1:${PORT}`;
const TARGET_WIDTH = 1560;

const ALL = [
  'compressor',
  'expander',
  'deesser',
  'delay',
  'equalizer',
  'harmonics',
  'limiter',
  'mbcomp',
  'mblimiter',
  'reverb',
  'stereo',
  'transients',
  'analyzer',
  'filter',
  'ringmod',
  'pulsator',
  'crusher',
  'phaser',
  'flanger',
];

function parsePlugins(argv) {
  const ids = new Set();
  for (let i = 0; i < argv.length; ++i) {
    const a = argv[i];
    if (a.startsWith('plugin=')) {
      ids.add(a.slice('plugin='.length).trim());
      continue;
    }
    if (a.startsWith('--plugin=')) {
      ids.add(a.slice('--plugin='.length).trim());
      continue;
    }
    if (a === '--plugin' || a === '-p') {
      const next = argv[++i];
      if (next) ids.add(next.trim());
      continue;
    }
    if (ALL.includes(a)) ids.add(a);
  }
  if (ids.size === 0) return ALL.slice();
  for (const id of ids) {
    if (!ALL.includes(id)) {
      console.error(`unknown plugin "${id}". known: ${ALL.join(', ')}`);
      process.exit(1);
    }
  }
  return [...ids];
}

function ensureGenerated() {
  const gen = path.join(ROOT, 'ui/src/generated/reverbModel.ts');
  if (!fs.existsSync(gen)) {
    console.error(
      'missing ui/src/generated/*.ts — run a CMake plugin build (codegen) once first.',
    );
    process.exit(1);
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url, attempts = 80) {
  for (let i = 0; i < attempts; ++i) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // retry
    }
    await wait(250);
  }
  throw new Error(`studio server did not start at ${url}`);
}

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('npm', args, {
      cwd: STUDIO,
      stdio: 'inherit',
    });
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} → ${code}`)),
    );
  });
}

async function forceStudioTheme(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('calfnxt.themeMode', 'night');
      localStorage.setItem('calfnxt.themeAccent', 'calfnxt');
      localStorage.setItem('calfnxt.showWidgetInfo', '0');
    } catch {
      /* ignore */
    }
  });
}

async function shotPlugin(browser, id) {
  const url = `${BASE}/#${id}`;
  // Probe CSS size at dpr=1
  const probe = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
  });
  await forceStudioTheme(probe);
  await probe.goto(url, { waitUntil: 'networkidle' });
  await probe.waitForSelector('[data-studio-frame][data-ready="1"]', {
    timeout: 45000,
  });
  const box = await probe.locator('[data-studio-frame]').boundingBox();
  await probe.close();
  if (!box) throw new Error(`no frame for ${id}`);

  const dpr = Math.min(3, Math.max(1, TARGET_WIDTH / box.width));
  const page = await browser.newPage({
    viewport: {
      width: Math.ceil(box.width) + 4,
      height: Math.ceil(box.height) + 4,
    },
    deviceScaleFactor: dpr,
  });
  await forceStudioTheme(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-studio-frame][data-ready="1"]', {
    timeout: 45000,
  });
  // Re-assert prefs after boot (in case localStorage raced or was flipped).
  await page.evaluate(() => {
    try {
      localStorage.setItem('calfnxt.showWidgetInfo', '0');
      localStorage.setItem('calfnxt.themeMode', 'night');
      localStorage.setItem('calfnxt.themeAccent', 'calfnxt');
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    root.classList.add('calfnxt-widget-info-off');
    for (const c of ['day', 'night']) root.classList.toggle(c, c === 'night');
    for (const c of ['calfnxt', 'lime', 'fire', 'sea'])
      root.classList.toggle(c, c === 'calfnxt');
  });
  // Extra settle for AUX SVG layouts + theme paint refresh
  await wait(200);

  const out = path.join(OUT_DIR, `${id}.png`);
  await page.locator('[data-studio-frame]').screenshot({ path: out, type: 'png' });
  await page.close();
  console.log(`    wrote ${out}  (${Math.round(box.width)}×${Math.round(box.height)} @${dpr.toFixed(2)}x)`);
}

async function main() {
  ensureGenerated();
  const plugins = parsePlugins(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('==> vite build');
  await runNpm(['run', 'build']);

  console.log('==> vite preview');
  const preview = spawn('npm', ['run', 'preview'], {
    cwd: STUDIO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const id of plugins) {
        console.log(`==> ${id}`);
        await shotPlugin(browser, id);
      }
    } finally {
      await browser.close();
    }
  } finally {
    preview.kill('SIGTERM');
    await wait(400);
    if (!preview.killed) preview.kill('SIGKILL');
  }

  console.log('==> done');
}

main().catch((err) => {
  const msg = String(err?.message ?? err);
  if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
    console.error(`
Playwright Chromium is missing (or outdated after a playwright upgrade).
From the studio/ folder run:

  npx playwright install chromium

Then retry: npm run studio
`);
  }
  console.error(err);
  process.exit(1);
});
