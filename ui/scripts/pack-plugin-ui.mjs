#!/usr/bin/env node
/**
 * Split the Vite MPA build into per-plugin Resource trees so each VST3
 * embeds only the assets reachable from its entry (no sibling plugin chunks).
 *
 * HTML lives at ui/src/html/<id>.html; Vite emits dist/src/html/<id>.html with
 * ../../assets/… links. We flatten to dist/plugins/<id>/{index.html,assets/}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(__dirname, '..');
const dist = path.join(uiRoot, 'dist');
const plugins = ['equalizer', 'stereo', 'transients'];

function readManifest() {
  const candidates = [
    path.join(dist, '.vite', 'manifest.json'),
    path.join(dist, 'manifest.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error('Vite manifest not found (enable build.manifest)');
}

/** Resolve manifest key for `src/html/<id>.html`. */
function findHtmlEntryKey(manifest, id) {
  const want = `${id}.html`;
  const keys = Object.keys(manifest);
  return (
    keys.find((k) => k === `src/html/${want}` || k.endsWith(`/html/${want}`)) ??
    keys.find((k) => k === want || k.endsWith(`/${want}`))
  );
}

function collectAssetRels(manifest, entryKey) {
  const files = new Set();
  const seen = new Set();

  const visit = (key) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    // HTML entries list the JS entry in `file` — keep only asset paths.
    if (chunk.file && chunk.file.startsWith('assets/')) files.add(chunk.file);
    for (const c of chunk.css ?? []) files.add(c);
    for (const a of chunk.assets ?? []) files.add(a);
    for (const i of chunk.imports ?? []) visit(i);
    for (const i of chunk.dynamicImports ?? []) visit(i);
  };

  visit(entryKey);
  return files;
}

function copyAsset(srcRel, destRoot) {
  const src = path.join(dist, srcRel);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing build artifact: ${srcRel}`);
  }
  const dest = path.join(destRoot, srcRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** Built HTML path next to Vite's nested out layout. */
function resolveBuiltHtml(manifest, htmlKey, id) {
  const src = manifest[htmlKey]?.src;
  const candidates = [
    src ? path.join(dist, src) : null,
    path.join(dist, 'src', 'html', `${id}.html`),
    path.join(dist, `${id}.html`),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Built HTML not found for "${id}"`);
}

/** Point script/link hrefs at ./assets/… for a flat Resources layout. */
function flattenAssetUrls(html) {
  return html
    .replace(/(href|src)="[^"]*\/assets\//g, '$1="./assets/')
    .replace(/(href|src)="assets\//g, '$1="./assets/');
}

const manifest = readManifest();
const outRoot = path.join(dist, 'plugins');
fs.rmSync(outRoot, { recursive: true, force: true });

for (const id of plugins) {
  const htmlKey = findHtmlEntryKey(manifest, id);
  if (!htmlKey) {
    throw new Error(`Manifest missing HTML entry for "${id}"`);
  }

  const assets = collectAssetRels(manifest, htmlKey);
  const destRoot = path.join(outRoot, id);
  fs.mkdirSync(destRoot, { recursive: true });

  for (const rel of assets) {
    copyAsset(rel, destRoot);
  }

  const htmlSrc = resolveBuiltHtml(manifest, htmlKey, id);
  const html = flattenAssetUrls(fs.readFileSync(htmlSrc, 'utf8'));
  fs.writeFileSync(path.join(destRoot, 'index.html'), html);

  console.log(`pack-plugin-ui: ${id} → ${assets.size} asset(s) (${htmlKey})`);
}
