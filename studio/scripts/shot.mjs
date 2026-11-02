#!/usr/bin/env node
/**
 * Build + serve the Studio Vite app, screenshot each plugin frame for every
 * day/night × accent pair → website/images/<mode>/<accent>/<id>.jpg
 *
 *   npm run shot
 *   npm run shot -- plugin=reverb
 *   npm run shot -- reverb
 *   npm run shot -- night calfnxt
 *   npm run shot -- reverb mode=day accent=lime
 *   npm run shot -- part=spectrum
 *     Ring modulator top chart only, 2048px wide,
 *     → website/images/header/<mode>-<accent>.jpg
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/**
 * Cursor injects PLAYWRIGHT_BROWSERS_PATH at a fresh /tmp sandbox cache.
 * Chromium already lives in ~/.cache/ms-playwright — do not re-download.
 */
function useInstalledPlaywrightBrowsers() {
  const envPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!envPath) return;
  let hasBrowser = false;
  try {
    hasBrowser = fs
      .readdirSync(envPath)
      .some(
        (name) =>
          name.startsWith('chromium') ||
          name.startsWith('chromium_headless_shell'),
      );
  } catch {
    hasBrowser = false;
  }
  if (!hasBrowser) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(__dirname, '..');
const ROOT = path.resolve(STUDIO, '..');
// Override when website/images is not writable (e.g. root-owned local tree).
const OUT_DIR = path.resolve(
  process.env.CALFNXT_STUDIO_OUT || path.join(ROOT, 'website/images'),
);
const PORT = Number(process.env.CALFNXT_STUDIO_PORT || 5174);
const BASE = `http://127.0.0.1:${PORT}`;
const TARGET_WIDTH = 1560;
/** Bitmap width of the ring-modulator chart used as the site header. */
const HEADER_WIDTH = 2048;

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
  'chorus',
  'split',
  'tuner',
  'octaver',
  'bender',
  'impulse',
  'tamer',
  'aligner',
  'denoiser',
];

const MODES = ['night', 'day'];
const ACCENTS = ['calfnxt', 'fire', 'lime', 'sea', 'slick'];

function parseArgs(argv) {
  const ids = new Set();
  const modes = new Set();
  const accents = new Set();
  let part = 'frame';
  let width = 0;
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
    if (a.startsWith('mode=')) {
      modes.add(a.slice('mode='.length).trim());
      continue;
    }
    if (a.startsWith('--mode=')) {
      modes.add(a.slice('--mode='.length).trim());
      continue;
    }
    if (a === '--mode') {
      const next = argv[++i];
      if (next) modes.add(next.trim());
      continue;
    }
    if (a === 'part=spectrum' || a === '--part=spectrum') {
      part = 'spectrum';
      continue;
    }
    if (a.startsWith('part=')) {
      part = a.slice('part='.length).trim();
      continue;
    }
    if (a.startsWith('--part=')) {
      part = a.slice('--part='.length).trim();
      continue;
    }
    if (a.startsWith('width=')) {
      width = Number(a.slice('width='.length));
      continue;
    }
    if (a.startsWith('--width=')) {
      width = Number(a.slice('--width='.length));
      continue;
    }
    if (a.startsWith('accent=')) {
      accents.add(a.slice('accent='.length).trim());
      continue;
    }
    if (a.startsWith('--accent=')) {
      accents.add(a.slice('--accent='.length).trim());
      continue;
    }
    if (a === '--accent') {
      const next = argv[++i];
      if (next) accents.add(next.trim());
      continue;
    }
    if (ALL.includes(a)) {
      ids.add(a);
      continue;
    }
    if (MODES.includes(a)) {
      modes.add(a);
      continue;
    }
    if (ACCENTS.includes(a)) {
      accents.add(a);
      continue;
    }
    console.error(
      `unknown argument "${a}". plugins: ${ALL.join(', ')}; modes: ${MODES.join(', ')}; accents: ${ACCENTS.join(', ')}; part=frame|spectrum`,
    );
    process.exit(1);
  }
  for (const id of ids) {
    if (!ALL.includes(id)) {
      console.error(`unknown plugin "${id}". known: ${ALL.join(', ')}`);
      process.exit(1);
    }
  }
  for (const mode of modes) {
    if (!MODES.includes(mode)) {
      console.error(`unknown mode "${mode}". known: ${MODES.join(', ')}`);
      process.exit(1);
    }
  }
  for (const accent of accents) {
    if (!ACCENTS.includes(accent)) {
      console.error(
        `unknown accent "${accent}". known: ${ACCENTS.join(', ')}`,
      );
      process.exit(1);
    }
  }
  if (part !== 'frame' && part !== 'spectrum') {
    console.error(`unknown part "${part}". known: frame, spectrum`);
    process.exit(1);
  }
  if (width && !(width >= 64 && width <= 8192)) {
    console.error(`width must be 64…8192, got ${width}`);
    process.exit(1);
  }
  const themes = [];
  for (const mode of modes.size ? [...modes] : MODES) {
    for (const accent of accents.size ? [...accents] : ACCENTS) {
      themes.push({ mode, accent });
    }
  }
  return {
    plugins:
      ids.size === 0 ? (part === 'spectrum' ? ['ringmod'] : ALL.slice()) : [...ids],
    themes,
    part,
    width: width || (part === 'spectrum' ? HEADER_WIDTH : TARGET_WIDTH),
  };
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
      code === 0
        ? resolve()
        : reject(new Error(`npm ${args.join(' ')} → ${code}`)),
    );
  });
}

async function prepStudioPage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('calfnxt.showWidgetInfo', '0');
      localStorage.setItem('calfnxt.historyVisible.expander.gr', '0');
      localStorage.setItem('calfnxt.historyVisible.expander.trigger', '0');
    } catch {
      /* ignore */
    }
  });
}

async function applyStudioTheme(page, mode, accent) {
  await page.evaluate(
    async ({ mode, accent }) => {
      try {
        localStorage.setItem('calfnxt.showWidgetInfo', '0');
        localStorage.setItem('calfnxt.themeMode', mode);
        localStorage.setItem('calfnxt.themeAccent', accent);
        localStorage.setItem('calfnxt.historyVisible.expander.gr', '0');
        localStorage.setItem('calfnxt.historyVisible.expander.trigger', '0');
      } catch {
        /* ignore */
      }
      const root = document.documentElement;
      root.classList.add('calfnxt-widget-info-off');
      for (const c of ['day', 'night']) root.classList.toggle(c, c === mode);
      for (const c of ['calfnxt', 'fire', 'lime', 'sea', 'slick'])
        root.classList.toggle(c, c === accent);
      window.__calfnxtStudioSetTheme?.(mode, accent);
      await new Promise((r) => requestAnimationFrame(() => r()));
      await new Promise((r) => requestAnimationFrame(() => r()));
    },
    { mode, accent },
  );
  // AUX SVG + themeColors$ rAF refresh
  await wait(280);
}

async function openPluginPage(browser, id, themes, dpr, frame) {
  const first = themes[0];
  const url = `${BASE}/?mode=${first.mode}&accent=${first.accent}#${id}`;
  const page = await browser.newPage({
    viewport: {
      width: Math.ceil(frame.width) + 4,
      height: Math.ceil(frame.height) + 4,
    },
    deviceScaleFactor: dpr,
  });
  await prepStudioPage(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-studio-frame][data-ready="1"]', {
    timeout: 45000,
  });
  return page;
}

async function probePlugin(browser, id, mode, accent) {
  const url = `${BASE}/?mode=${mode}&accent=${accent}#${id}`;
  const probe = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
  });
  await prepStudioPage(probe);
  await probe.goto(url, { waitUntil: 'networkidle' });
  await probe.waitForSelector('[data-studio-frame][data-ready="1"]', {
    timeout: 45000,
  });
  const frame = await probe.locator('[data-studio-frame]').boundingBox();
  const spectrum = await probe.locator('[data-shot="spectrum"]').boundingBox();
  await probe.close();
  if (!frame) throw new Error(`no frame for ${id}`);
  return { frame, spectrum };
}

async function shotPlugin(browser, id, themes, targetWidth) {
  const first = themes[0];
  const { frame: box } = await probePlugin(browser, id, first.mode, first.accent);
  const dpr = Math.min(3, Math.max(1, targetWidth / box.width));
  const page = await openPluginPage(browser, id, themes, dpr, box);

  for (const { mode, accent } of themes) {
    await applyStudioTheme(page, mode, accent);
    const dir = path.join(OUT_DIR, mode, accent);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${id}.jpg`);
    await page.locator('[data-studio-frame]').screenshot({
      path: out,
      type: 'jpeg',
      quality: 80,
    });
    console.log(
      `    wrote ${mode}/${accent}/${id}.jpg  (${Math.round(box.width)}×${Math.round(box.height)} @${dpr.toFixed(2)}x)`,
    );
  }
  await page.close();
}

/** Ring-modulator top chart, one JPEG per theme, for the site header. */
async function shotSpectrum(browser, themes, targetWidth) {
  const id = 'ringmod';
  const first = themes[0];
  const { frame, spectrum } = await probePlugin(
    browser,
    id,
    first.mode,
    first.accent,
  );
  if (!spectrum) throw new Error('ring modulator has no [data-shot="spectrum"]');
  const dpr = Math.min(4, Math.max(1, targetWidth / spectrum.width));
  const page = await openPluginPage(browser, id, themes, dpr, frame);
  const dir = path.join(OUT_DIR, 'header');
  fs.mkdirSync(dir, { recursive: true });
  for (const { mode, accent } of themes) {
    await applyStudioTheme(page, mode, accent);
    const out = path.join(dir, `${mode}-${accent}.jpg`);
    await page.locator('[data-shot="spectrum"]').screenshot({
      path: out,
      type: 'jpeg',
      quality: 90,
    });
    const box = await page.locator('[data-shot="spectrum"]').boundingBox();
    const w = box ? Math.round(box.width * dpr) : 0;
    const h = box ? Math.round(box.height * dpr) : 0;
    console.log(`    wrote header/${mode}-${accent}.jpg  (${w}×${h})`);
  }
  await page.close();
}

async function main() {
  useInstalledPlaywrightBrowsers();
  ensureGenerated();
  const { plugins, themes, part, width } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(
    part === 'spectrum'
      ? `==> ring modulator chart × ${themes.length} theme(s) @ ${width}px → images/header/`
      : `==> ${plugins.length} plugin(s) × ${themes.length} theme(s)`,
  );

  console.log('==> vite build');
  await runNpm(['run', 'build']);

  console.log(`==> vite preview :${PORT}`);
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    {
      cwd: STUDIO,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch({ headless: true });
    try {
      if (part === 'spectrum') {
        await shotSpectrum(browser, themes, width);
      } else {
        for (const id of plugins) {
          console.log(`==> ${id}`);
          await shotPlugin(browser, id, themes, width);
        }
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
  if (
    msg.includes("Executable doesn't exist") ||
    msg.includes('playwright install')
  ) {
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
