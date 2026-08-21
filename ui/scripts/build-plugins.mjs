#!/usr/bin/env node
/**
 * One Vite production build per plugin (single entry → typically 1 JS + 1 CSS
 * + fonts/logo). Output: ui/dist/plugins/<id>/{index.html,assets/}.
 *
 * Usage:
 *   node scripts/build-plugins.mjs              # all plugins
 *   node scripts/build-plugins.mjs mbcomp       # one plugin
 *   node scripts/build-plugins.mjs mbcomp delay # several
 *   npm run build -- mbcomp
 *
 * Dev (`npm run dev`) still uses index.html + hash router; not this script.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(__dirname, '..');
const dist = path.join(uiRoot, 'dist');
const ALL_PLUGINS = [
  'equalizer',
  'stereo',
  'transients',
  'compressor',
  'expander',
  'deesser',
  'delay',
  'reverb',
  'mbcomp',
  'limiter',
  'mblimiter',
  'harmonics',
  'analyzer',
  'filter',
  'ringmod',
  'pulsator',
  'crusher',
  'phaser',
  'flanger',
  'chorus',
  'split',
];

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
  console.log(`Usage:
  node scripts/build-plugins.mjs              # all plugins
  node scripts/build-plugins.mjs mbcomp       # one plugin
  node scripts/build-plugins.mjs mbcomp delay # several
  npm run build -- mbcomp

Known: ${ALL_PLUGINS.join(', ')}`);
  process.exit(0);
}

const requested = rawArgs.filter((a) => !a.startsWith('-'));
const plugins = requested.length > 0 ? requested : ALL_PLUGINS;

for (const id of plugins) {
  if (!ALL_PLUGINS.includes(id)) {
    console.error(
      `build-plugins: unknown plugin "${id}" (known: ${ALL_PLUGINS.join(', ')})`,
    );
    process.exit(1);
  }
}

/** Point script/link hrefs at ./assets/… for a flat Resources layout. */
function flattenAssetUrls(html) {
  return html
    .replace(/(href|src)="[^"]*\/assets\//g, '$1="./assets/')
    .replace(/(href|src)="assets\//g, '$1="./assets/')
    .replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/gi, '');
}

function findBuiltHtml(pluginDist, id) {
  const candidates = [
    path.join(pluginDist, 'src', 'html', `${id}.html`),
    path.join(pluginDist, `${id}.html`),
    path.join(pluginDist, 'index.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Built HTML not found for "${id}" under ${pluginDist}`);
}

function flattenPluginDir(id) {
  const pluginDist = path.join(dist, 'plugins', id);
  const htmlSrc = findBuiltHtml(pluginDist, id);
  const html = flattenAssetUrls(fs.readFileSync(htmlSrc, 'utf8'));
  fs.writeFileSync(path.join(pluginDist, 'index.html'), html);

  // Drop Vite's nested HTML path if present.
  const nestedHtmlDir = path.join(pluginDist, 'src');
  if (fs.existsSync(nestedHtmlDir))
    fs.rmSync(nestedHtmlDir, { recursive: true, force: true });

  const assetsDir = path.join(pluginDist, 'assets');
  const assets = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter((n) => !n.startsWith('.'))
    : [];
  console.log(`build-plugins: ${id} → ${assets.length} asset(s)`);
}

fs.mkdirSync(path.join(dist, 'plugins'), { recursive: true });

// Full rebuild wipes every pack; selective keeps siblings (faster iterate).
if (requested.length === 0) {
  fs.rmSync(path.join(dist, 'plugins'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, 'plugins'), { recursive: true });
}

for (const id of plugins) {
  const html = path.join(uiRoot, 'src', 'html', `${id}.html`);
  if (!fs.existsSync(html))
    throw new Error(`Missing entry HTML: ${html}`);

  const pluginDist = path.join(dist, 'plugins', id);
  fs.rmSync(pluginDist, { recursive: true, force: true });

  const r = spawnSync(
    'npx',
    ['vite', 'build'],
    {
      cwd: uiRoot,
      env: { ...process.env, CALFNXT_PLUGIN: id },
      stdio: 'inherit',
      shell: false,
    },
  );
  if (r.status !== 0)
    process.exit(r.status ?? 1);

  flattenPluginDir(id);
}

// Stamp for CMake / prebuilt UI checks (same path as before).
fs.writeFileSync(path.join(dist, '.stamp'), `${new Date().toISOString()}\n`);
console.log(
  `build-plugins: done → ${plugins.map((id) => `dist/plugins/${id}/`).join(' ')}`,
);
