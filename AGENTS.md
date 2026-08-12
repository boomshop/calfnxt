# calfNXT — Agent handoff

Read this before continuing work. Project path: `/home/markus/Programmierung/calf/calfnxt`
(renamed from `calf_next` on 2026-07-25). Chat history may not follow the rename in Cursor.

Also see `ARCHITECTURE.md` for the high-level stack, and `VERSIONING.md`
for suite SemVer / release rules (`tools/release.sh`).

---

## What this project is

Greenfield **VST3 + WebKitGTK** (Linux first) plugin suite. One `.vst3` per plugin.
Shared React SPA UI embedded into each bundle’s `Resources/`. Branding: **calfNXT**
(namespace `calfNXT`, cmake `calfnxt`, URI `calfnxt://`, bridge `calfnxtNative`).

**Editor process model:** the VST3 `.so` must **not** link GTK/WebKit (Ardour’s
internalized toolkit collides with system GTK3 — `GdkDisplay` GType abort).
`WebEditor` in the host process is a thin proxy: it spawns `calfnxt-web-host`
(GtkPlug + WebKit, XEmbed into the host XID) and forwards the JSON bridge over a
Unix socketpair. Each bundle ships `Contents/<arch>/calfnxt-web-host` next to the `.so`.

Plugins today: **Equalizer** (`#equalizer`), **Stereo** (`#stereo`), **Transients** (`#transients`), **Compressor** (`#compressor`), **DeEsser** (`#deesser`), **Delay** (`#delay`), **Reverb** (`#reverb`), **Multiband Compressor** (`#mbcomp`).
More Calf-heritage processors planned.

---

## Naming map (do not reintroduce old names)

Old brand spelling `CalfNXT` is obsolete — use **`calfNXT`**. Also never bring back
`Calf Next`, `CalfNext`, `calf-next`, `calf_next`, `calfNative`.

| Kind | Value |
|------|--------|
| Display / vendor | `calfNXT` |
| Vendor URL / email | `https://calfnxt.org`, `mailto:schmidt@boomshop.net` |
| C++ namespace | `calfNXT` |
| CMake project / libs | `calfnxt`, `calfnxt_ui`, `calfnxt_dsp`, `calfnxt_web_ui` |
| Plugin targets | `calfnxt-equalizer`, `calfnxt-stereo`, `calfnxt-transients`, `calfnxt-compressor`, `calfnxt-deesser`, `calfnxt-delay`, `calfnxt-reverb`, `calfnxt-mbcomp` |
| VST3 package / `.so` | `calfNXTEqualizer`, `calfNXTStereo`, `calfNXTTransients`, `calfNXTCompressor`, `calfNXTDeesser`, `calfNXTDelay`, `calfNXTReverb`, `calfNXTMbcomp` (must match; Carla/JUCE) |
| Install names | `~/.vst3/calfNXTEqualizer.vst3`, `calfNXTStereo.vst3`, `calfNXTTransients.vst3`, `calfNXTCompressor.vst3`, `calfNXTDeesser.vst3`, `calfNXTDelay.vst3`, `calfNXTReverb.vst3`, `calfNXTMbcomp.vst3` |
| URI scheme | `calfnxt://bundle/...` |
| JS bridge | `window.calfnxtNative.post`, `__calfnxtOnHost`, `__calfnxtHostQ` |
| Script message handler | `webkit.messageHandlers.calfnxt` |
| Env flags | `CALFNXT_WEB_DEBUG`, `CALFNXT_WEB_INSPECTOR`, `CALFNXT_UI_SCALE`, `CALFNXT_WEB_NO_GPU` (full list in `README.md`) |
| Install (packaging) | `cmake --install` → `${prefix}/${CALFNXT_VST3_INSTALL_DIR}` (default `lib/vst3`); user copy via `./tools/install-user-vst3.sh` `[plugin…]` / `[--dest dir]` |
| Msg type (TS) | `calfNXTMsg` |

Classic upstream “Calf Studio Gear” may still be mentioned as the DSP heritage; that is not this product name.

---

## Layout

```
common/ui/     WebEditor proxy (host process) + calfnxt-web-host (GtkPlug/WebKit OOP)
common/dsp/    EffectBase (SingleComponentEffect), peak_hold.h
dsp/equalizer/ equalizer.plugin.json + DSP + codegen
dsp/stereo/    stereo.plugin.json + DSP + codegen
dsp/transients/ transients.plugin.json + DSP + codegen
dsp/compressor/ compressor.plugin.json + DSP + codegen
dsp/deesser/   deesser.plugin.json + DSP + codegen
dsp/delay/     delay.plugin.json + DSP + codegen
dsp/reverb/    reverb.plugin.json + DSP + codegen
dsp/mbcomp/    mbcomp.plugin.json + DSP + codegen
tools/codegen/ generate_plugin.py → C++ params + TS models
ui/            React SPA (Vite), hash router #equalizer / #stereo / … / #reverb / #mbcomp
external/vst3sdk/
```

SSOT for params: `dsp/<id>/<id>.plugin.json` → codegen.
Codegen always injects standard **`in_gain` / `out_gain`** (ParamIDs 0/1) ahead of plugin params.

---

## Parameter path (DSP ↔ widget) — keep this

**Two value spaces:** plain (dB etc., UI + DSP) vs VST normalized `0…1` (host).

### Host/DSP → UI
1. `process()`: `syncParamPlains(data, params_, kParamCount)` — one pass over host queues
   (`setNormalized`), then fill **plain** array from Parameters (auxvst-style; not O(n×queues)).
2. Plugin DSP reads `params_[kParam…]` (plain: dB, etc.). Do **not** store 0…1 in DSP.
3. `WebEditor` proxy: `IDependent::update` + **poll ~16 ms** → `pushParamPlain` → coalesce →
   socket line → helper `evalJs` `__calfnxtOnHost({t:"param",id,v})` with locale-safe
   `std::to_chars` (never `snprintf %.g` under `de_DE`).
4. `bind_param.ts` → AWML `DynamicValue.set(plain)`.
5. AUX widget via `use-aux-widgets` (`value$`, Fader often `sync: true`).

### UI → Host/DSP
1. Gesture: `begin` / `end` (`composeInteractingOnSet` on Fader/Knob).
2. `set`: TS posts `{t:"set",id,v}`; **injected bridge** converts to fixed-point `q`/`d` (WebKit IPC was coercing floats to ints).
3. C++: `plain=q/d` → `toNormalized` → `setParamNormalized` + `performEdit` (echo suppressed).

### Host default quirks (Carla etc.)
Do **not** call `restartComponent` / begin/perform/end from `setComponentHandler` or `setActive` — Qtractor SIGSEGVs on that re-entrancy. Defaults live on Parameter objects (`getParamNormalized`); after `setState`, `notifyHostStateRestored()` only snapshots plains + suppress-stomps (no host restart).

### Real fixes — do not “clean up” as debug junk
- Polling + param dependents
- Queue → `setNormalized` inside `syncParamPlains`
- UI→host `q`/`d`
- Host→UI `to_chars` `v`
- Fader `sync: true` where needed
- Embed UI via `calfnxt_copy_plugin_ui` / `*-resources` targets (UI rebuild alone does not update VST3 Resources)
- Editor HiDPI: enlarge via host/css when XEmbed socket ≈ design; if socket already > design (Qtractor), skip enlarge and fill helper to socket (`CALFNXT_UI_SCALE` override)
- DSP hygiene: keep silence-flag passthrough correct, add denormal sanitizing for stateful filters/meters,
  and prefer idle/block fast-paths over per-sample recomputation when parameters are unchanged

---

## Viz / meters (non-parameter channel)

**Intent:** meters/analyzers are **not** VST parameters. Every plugin exposes **in** and **out** level streams.

- Shared `Dsp::IoStage` (`io_stage.h`): `begin()` = in_gain + input peaks; plugin DSP in-place on outs; `end()` = out_gain + output peaks.
- Tap points: **in** after `in_gain`, **out** after processing + `out_gain`.
- Plugin implements `Ui::IVizSource` (usually forwards to `io_`); `EffectBase::createView` → `WebEditor::setVizSource`.
- ~**30 Hz** flush → `{t:"viz",id:"in"|"out",kind:"levels",v:[…]}`.
- Optional host tempo (Delay): `IVizSource::takeHostTempo` / `vizTempoId()` → `{t:"viz",id:"delay",kind:"tempo",v:[valid,bpm]}` → `bindVizTempo`.
- Host also pushes `{t:"io",ch:N}` (bus channel count).
- Header (`createHeaderIo`) binds In/Out MultiMeters + In/Out gain knobs for all plugins.
- Future analyzers: `kind:"spectrum"`; UI→host `{t:"vizcfg",id,bins:N}`. Prefer binary/base64 later for large arrays.

---

## Editor size / HiDPI

1. Open at design size from `*.plugin.json`.
2. Helper reports XEmbed socket size (`_socket`); SPA reports CSS viewport.
3. If socket is still ≈ design (Carla/Ardour): `scale = host/css` →
   `resizeView(design × scale)`.
4. If socket is already larger than design (Qtractor/Qt DPR): **do not** enlarge
   again — only size the web-host plug to the socket so the UI fills the window.
5. Optional override: `CALFNXT_UI_SCALE` (e.g. `1.35` or `1`) wins.

`WebEditor` (proxy): IRunLoop ~16 ms pumps the socket + param/viz flush.
`calfnxt-web-host`: HW accel **on** by default (`ALWAYS`); force software with
`CALFNXT_WEB_NO_GPU=1` if the embed paints blank/transparent. Diagnostics always
append to `/tmp/calfnxt-ui.log` (URI misses, JS errors). Env reference: `README.md`.
GtkPlug size sync, `web-process-terminated` → reload + `{t:"_ready"}`.
Verify Ardour-safe link: `ldd …/*.so` must not list `libgtk-3` / `libwebkit`.

---

## UI structure

- Dev SPA: `ui/index.html` → `main.tsx` → `App.tsx` hash `#<pluginId>`.
- Production: per-plugin Vite builds (`src/html/<id>.html` → `src/entries/*`);
  `build-plugins.mjs` writes `ui/dist/plugins/<id>/` (one JS + one CSS + fonts/logo).
  Each VST3 embeds `dist/plugins/<id>/` as `Resources/` (`calfnxt_copy_plugin_ui`).
- `ui/src/plugins/registry.ts` lazy map (dev router).
- `Bound*UI` creates host-bound model; `*UI` is presentational.
- Shared `Header`: logo, title, children slot, In/Out MultiMeter + gain.
- Widgets: `Fader`, `Knob`, `MultiMeter`, `LevelMeter`, `EQChart`, … under `ui/src/widgets/`.
- Dev UI: `cd ui && npm run dev` → http://localhost:5173/#equalizer (HMR).
  `DevShell` frames the plugin at `editor.width`×`editor.height` from `*.plugin.json`.
  Production build has no DevShell chrome.

---

## Build / install

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target calfnxt-plugins -j
# user install — force-rebuilds SPA, embeds Resources, copies ~/.vst3
./tools/install-user-vst3.sh
# fast iterate on one plugin (UI + DSP + install that bundle only):
./tools/install-user-vst3.sh mbcomp
# several: ./tools/install-user-vst3.sh mbcomp compressor
# custom dest: ./tools/install-user-vst3.sh --dest /usr/lib/vst3 mbcomp
# packaging: cmake --install build --prefix /usr   # → $prefix/lib/vst3
# (close the plugin host first if ~/.vst3 remove fails with Permission denied)
# suite release (version bump, tag, ui-dist GitHub asset): see VERSIONING.md
# ./tools/release.sh
```

UI pack alone (no install): `cd ui && npm run build -- mbcomp` (or omit the id for all plugins).

Install paths (user default): `~/.vst3/calfNXTEqualizer.vst3`, … `calfNXTMbcomp.vst3`  
System / packaging: `${CMAKE_INSTALL_PREFIX}/${CALFNXT_VST3_INSTALL_DIR}/` (default `lib/vst3`).

Open Cursor on **`/home/markus/Programmierung/calf/calfnxt`** (not `calf_next`).

---

## User preferences (from sessions)

- Replies: **German**.
- Repo docs/comments: **English** (`.cursor/rules/english-comments.mdc`).
- Do not commit unless asked.
- Prefer AUX widgets; match Pan Acoustics pan-control-px patterns where useful.
- Avoid drive-by refactors; no fake “cleanup” of the real param/viz/HiDPI fixes above.

---

## Equalizer bands

- Fixed **16** VST slots (`b01_…`…`b16_…`: active/type/slope/freq/gain/q + dyn/dyn_attack/dyn_release/dyn_threshold/dyn_ratio/dyn_listen). No add/remove in UI.
- UI type change keeps per-type gain/Q/slope memory (first visit → safe defaults); host/preset type sync does not rewrite siblings.
- DSP: `common/dsp/biquad.h` (Calf/RBJ) + `eq_band.h` (LP/HP cascade 12/24/36/48 with Q as resonance at fc; Freq/Q/Gain glide) + `compressor.h` (Thor gain reduction for DynEQ).
- **Dynamic EQ** (per band): type-matched detector (BP / LP / HP) → `GainReduction` → `effectiveDb = staticGain + 20*log10(GR)` on peaking/shelf/BP gain. Pass filters keep dyn params but GR does not affect audio until type uses gain.
- **Listen** (`dyn_listen`): solos that band’s detector into the output (EQ bypassed); only one band at a time. Band icon uses `--color-warn` while listening.
- UI curves: handle EqBands use static `gain$`; ghost EqBands + baseline use DSP `effectiveGain$` via viz `{t:"viz",id:"eq",kind:"gains",v:[…]}` (all 16 bands, static or dyn).
- Process order: `IoStage.begin` → active bands → `IoStage.end`.
- UI: always 16 rows; Active toggle label = band number (`index+1`); default selection = band 9; Dyn controls in band detail row when type supports dyn.
- Default layout: B1–B12 peaking 60…5k, B13 LS@120, B14 HS@5k, B15 HP@30, B16 LP@10k.
- Chart curves use RBJ factories in `ui/src/dsp/eqFilters.ts` (same math as `common/dsp/biquad.h`); band-pass applies gain.

---

## Multiband Compressor bands

- Fixed **6** VST band slots (`b01_…`…`b06_…`: active/bypass/listen/threshold/ratio/knee/
  attack/release/makeup/mix/mode/link/pdr); `num_bands` (2…6) decides how many run,
  `slope` picks the LR crossover (12/24/48), `xover1…xover5` the split frequencies.
- Raising `num_bands` in the UI seeds the new crossover at the geometric mean of the
  previous top crossover and 20 kHz; `listen` is exclusive like the EQ's `dyn_listen`.
- Viz id `"mbcomp"`: `gr` (array, ≤0 dB per band → `bindVizGrArray`), `gains` (chart curves),
  `bandio` (`[in0,out0,in1,out1,…]` dB → `bindVizBandIo`), `point` (`[in,out]` for the transfer
  chart) and `envelope` packed as bands × (slots × 3) + phase with
  channels `[fullPeak, bandPeak, grLin]` (split into per-band `historyData$`).
- UI: `MultibandChart` (AUX Equalizer; one stroked HP/LP curve per band whose dB offset is
  the band's GR, vertical crossover handles, one threshold handle at each band's geometric
  center) → `BandBridgeChart` → band strips → `BandBridgeChart` → detail panel for the
  selected band (Compressor controls without FrequencyRange).
- Band curves use the gain-carrying pass factories in `ui/src/dsp/eqFilters.ts`
  (`auxLowpassGain12/24/48`, `auxHighpassGain12/24/48`).

---

## Open / deferred

1. Analyzer arrays (`viz` + `vizcfg` bins).
2. **Plugin backlog** (Calf heritage → calfNXT name; order not fixed):
   - Multi Chorus → **Chorus**
   - **Phaser**
   - **Flanger**
   - **Pulsator**
   - **Ring Modulator**
   - Gate / Sidechain Gate → **Expander**
   - **Limiter**
   - **Multiband Limiter**
   - Filter / Envelope Filter → **Filter**
   - Saturator / Exciter / Bass Enhancer → **Saturator** (name may still change)
   - **Vinyl**
   - **Crusher**
   - **Analyzer**
   - **Mono Input**
   - Optional: **Vocoder** (FIR-based if done)
   - Optional: **Crossovers** (dynamic band count if done)
3. macOS / Windows WebView hosts.
4. Optional: compare `examples/auxvst` WebView hosting; optional SVF upgrade if steep bass still artifacts.

---

## Quick file index

| Concern | Files |
|---------|--------|
| Editor / bridge | `common/ui/web_editor.{h,cpp}`, `web_host_main.cpp`, `viz_source.h` |
| DSP base / I/O / peaks / EQ | `common/dsp/effect_base.*`, `io_stage.h`, `peak_hold.h`, `biquad.h`, `eq_band.h`, `compressor.h` |
| Reference (WebView/params) | `examples/auxvst/` (call it **auxvst**, not MDA) |
| Equalizer DSP | `dsp/equalizer/source/*_dsp.*` |
| Stereo DSP | `dsp/stereo/source/*_dsp.*` |
| Transients DSP | `dsp/transients/source/*_dsp.*`, `common/dsp/transients.h` |
| Compressor DSP | `dsp/compressor/source/*_dsp.*`, `common/dsp/compressor.h`, `common/dsp/sidechain_filter.h` |
| DeEsser DSP | `dsp/deesser/source/*_dsp.*`, `common/dsp/deesser_detector.h`, `common/dsp/band_splitter.h` |
| Delay DSP | `dsp/delay/source/*_dsp.*`, `common/dsp/sidechain_filter.h`, `common/dsp/smooth_gain.h` |
| Reverb DSP | `dsp/reverb/source/*_dsp.*`, `common/dsp/reverb_*.h`, `common/dsp/delay_line.h` |
| Multiband Compressor | `dsp/mbcomp/source/*_dsp.*`, `common/dsp/band_splitter.h`, `common/dsp/compressor.h`; UI `ui/src/plugins/MbcompUI/*`, `host/mbcompHost.ts`, `widgets/MultibandChart/*`, `widgets/BandBridgeChart/*` |
| Param bind | `ui/src/bridge.ts`, `bind_param.ts`, `host/*Host.ts` |
| Header I/O | `ui/src/components/Header/*`, `host/headerMeters.ts` |
| Meters | `ui/src/widgets/MultiMeter/*`, `LevelMeter/*` |
| Codegen | `tools/codegen/generate_plugin.py` |
| Release / SemVer | `VERSIONING.md`, `tools/release.sh` |
