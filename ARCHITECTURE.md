# calfNXT

> Agent / session handoff (param bridge, viz, HiDPI viewport sizing, naming): see **`AGENTS.md`**.

Greenfield: **VST3 + WebKitGTK** (Linux first). Classic Calf Studio Gear DSP stays the audio core; UI is a modern Web view (React + DynamicValues).

## Stack

| Layer | Choice |
|-------|--------|
| Format | VST3 (Steinberg SDK, no VSTGUI) — **one `.vst3` per plugin** |
| Host target | Ardour / Carla Linux (`~/.vst3`) |
| DSP | Hand-written C++ under `dsp/` |
| Parameters / metadata | Per-plugin descriptor → **codegen** |
| DSP shell | `common/dsp` → `calfNXT::Plugin::EffectBase` |
| UI shell | `common/ui` → `calfNXT::Ui::WebEditor` + React SPA in `ui/` |
| Bridge | `window.calfnxtNative.post` ↔ AWML `DynamicValue` + AUX widgets (`@deutschesoft/*`) |

## Descriptor (SSOT)

Each plugin owns `dsp/<id>/<id>.plugin.json`:

- `id`, `name`, `vendor`, `version`, `category`
- `vst3_uid` (four hex words)
- `editor` size (`width` / `height`); SPA route is `#<id>`
- `buses` (audio in/out)
- `parameters[]`: `id`, `name`, `type`, `unit`, `min`, `max`, `default`, `scale`, `precision`

Codegen (`tools/codegen/generate_plugin.py`) produces:

- C++: ParamIDs, FUID, `registerParameters()`, `kEditorHtml` (`index.html#<id>`)
- TS: DynamicValues model for the React UI
- Aggregated `plugins.registry.json` (build artifact)

Hand-written: DSP algorithm + React layout (`ui/src/plugins/<Name>UI/`).

## Shared layers

### `common/dsp` — `EffectBase`

Stereo I/O, float32/64, `createView` → WebEditor, param helpers, host default-value notify.
Optional `vizSource()` for non-parameter telemetry (peak meters).

### `common/ui` — `WebEditor`

WebKitGTK + X11 embed + host run loop + `calfnxt://` bundle scheme.
Param bridge + viz flush (~30 Hz): `{t:"viz",id:"in"|"out",kind:"levels",v:[…]}`.
Editor HiDPI: UI `{t:"viewport"}` → `resizeView` (optional `CALFNXT_UI_SCALE`).

### `ui/` — React SPA

- Single `index.html` → `App.tsx` picks plugin via `location.hash` (`#equalizer`)
- `plugins/registry.ts` — lazy map `id → Bound*UI`
- `widgets/` — AUX → React (`componentFromWidget`)
- `host/` — binds params + viz streams to AWML `DynamicValue`s
- `plugins/<Name>UI/` — pure views + `Bound*UI` shell

## Build

Step-by-step **build / embed UI / install to `~/.vst3`**: see **[`README.md`](README.md)**.

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
# or UI only: cd ui && npm install && npm run build
```

Dev UI: `cd ui && npm run dev` → http://localhost:5173/#equalizer (HMR, sized DevShell).

## Layout

```
common/ui/              # WebEditor → calfnxt_ui
common/dsp/             # EffectBase + IoStage + peak_hold → calfnxt_dsp
dsp/equalizer/          # descriptor + DSP
tools/codegen/
ui/
  index.html            # SPA shell
  src/
    App.tsx             # hash router
    plugins/            # EqualizerUI, registry
    generated/          # codegen TS models
external/vst3sdk/
```

## Intentionally deferred

- Spectrum / analyzer arrays (`kind:"spectrum"` + UI→host `vizcfg` bin count)
- Additional Calf-heritage plugins beyond Equalizer
- Full AUX catalog beyond current widgets (Fader/Knob/MultiMeter/EQChart/…)
- macOS / Windows WebView hosts
- Shared Resources across `.vst3` bundles (each still embeds a SPA copy)
