# calfNXT Screenshot Studio

Optional tooling to render each plugin UI with **static demo fixtures** and export
PNGs to `website/images/` via Playwright.

Normal plugin development does **not** need this package. Install only when you
want to refresh website screenshots.

## Setup (once)

```bash
# From repo root — requires ui/src/generated/* (run a CMake plugin build once)
npm run studio:install
# or: cd studio && npm install && npx playwright install chromium
```

If `npm run studio` fails with *Executable doesn't exist* after a Playwright
upgrade, re-run `npx playwright install chromium` inside `studio/`.

Optional: seed history curves from existing host screenshots (Pillow):

```bash
python3 scripts/extract_history.py
# or: python3 scripts/extract_history.py compressor
```

Mbcomp strip history is seeded from the **compressor** fixture envelope
(`gen_synthetic_viz.mjs` packs it into per-band `[full, band, grLin]` channels)
until a dedicated capture exists. Limiter history uses the same compressor
envelope remapped to `[audio, grLin]` (see `fixtures/limiter/`).

Regenerate synthetic viz (meters / envelopes) without extraction:

```bash
node scripts/gen_synthetic_viz.mjs
```

## Capture

From **repo root**:

```bash
npm run studio                 # all plugins → website/images/<id>.png
npm run studio -- plugin=reverb
npm run studio -- reverb
```

Or from `studio/`:

```bash
npm run shot
npm run shot -- equalizer
```

Output width targets ~1560 CSS×deviceScaleFactor (matches current website assets).
Frames are design-size (`*.plugin.json` editor WxH) without DevShell chrome.
**WithInfo tip bubbles are forced off** for every capture (`showWidgetInfo$` + CSS).

## Preview in the browser

```bash
cd studio && npm run dev
# http://127.0.0.1:5174/#compressor
```

## Layout

| Path | Role |
|------|------|
| `src/` | Vite app: mounts presentational UIs from `ui/src/studioApi.ts` |
| `fixtures/<id>/params.json` | Knob / mode plains |
| `fixtures/<id>/viz.json` | Static levels, history, GR, gonio, … |
| `scripts/shot.mjs` | Playwright capture |
| `scripts/extract_history.py` | Best-effort envelope from `website/images/*.png` |

`website/` remains gitignored; copy/deploy screenshots separately.
