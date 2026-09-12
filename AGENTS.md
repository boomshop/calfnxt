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
`webkit2gtk-4.1` is WebKit2 **for GTK 3**, not GTK 2. `WebEditor` in the host
process is a thin proxy: it spawns `calfnxt-web-host` (GtkPlug + WebKit, XEmbed
into the host XID) and forwards the JSON bridge over a Unix socketpair. The
helper’s spawn `envp` omits `LD_LIBRARY_PATH` (Mixbus/Ardour bundled glib breaks
system WebKit); the **host `environ` is never mutated**. Opt out with
`CALFNXT_KEEP_HOST_LDPATH`. Each bundle ships `Contents/<arch>/calfnxt-web-host`
next to the `.so`. User-facing contract: `README.md` → Clarifications.

Plugins today: **Equalizer** (`#equalizer`), **Stereo** (`#stereo`), **Transients** (`#transients`), **Compressor** (`#compressor`), **Expander** (`#expander`), **DeEsser** (`#deesser`), **Delay** (`#delay`), **Reverb** (`#reverb`), **Impulse** (`#impulse`), **Multiband Compressor** (`#mbcomp`), **Limiter** (`#limiter`), **Multiband Limiter** (`#mblimiter`), **Harmonics** (`#harmonics`), **Analyzer** (`#analyzer`), **Filter** (`#filter`), **Ring Modulator** (`#ringmod`), **Pulsator** (`#pulsator`), **Crusher** (`#crusher`), **Phaser** (`#phaser`), **Flanger** (`#flanger`), **Chorus** (`#chorus`), **Split** (`#split`), **Tuner** (`#tuner`), **Octaver** (`#octaver`), **Bender** (`#bender`).
Suite focus is this set — no near-term new plugins unless explicitly requested.

---

## Naming map (do not reintroduce old names)

Old brand spelling `CalfNXT` is obsolete — use **`calfNXT`**. Also never bring back
`Calf Next`, `CalfNext`, `calf-next`, `calf_next`, `calfNative`.

| Kind                   | Value                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display / vendor       | `calfNXT`                                                                                                                                                                                                                                                                                                           |
| Vendor URL / email     | `https://calfnxt.org`, `mailto:schmidt@boomshop.net`                                                                                                                                                                                                                                                                |
| C++ namespace          | `calfNXT`                                                                                                                                                                                                                                                                                                           |
| CMake project / libs   | `calfnxt`, `calfnxt_ui`, `calfnxt_dsp`, `calfnxt_web_ui`                                                                                                                                                                                                                                                            |
| Plugin targets         | `calfnxt-equalizer`, … `calfnxt-bender`, `calfnxt-impulse` |
| VST3 package / `.so`   | `calfNXTEqualizer`, … `calfNXTBender`, `calfNXTImpulse` (must match; Carla/JUCE) |
| Install names          | `~/.vst3/calfNXTEqualizer.vst3`, … `calfNXTBender.vst3`, `calfNXTImpulse.vst3` |
| URI scheme             | `calfnxt://bundle/...`                                                                                                                                                                                                                                                                                              |
| JS bridge              | `window.calfnxtNative.post`, `__calfnxtOnHost`, `__calfnxtHostQ`                                                                                                                                                                                                                                                    |
| Script message handler | `webkit.messageHandlers.calfnxt`                                                                                                                                                                                                                                                                                    |
| Env flags              | `CALFNXT_WEB_DEBUG`, `CALFNXT_WEB_INSPECTOR`, `CALFNXT_UI_SCALE`, `CALFNXT_WEB_NO_GPU`, `CALFNXT_XWAYLAND_NUDGE`, `CALFNXT_KEEP_HOST_LDPATH` (full list in `README.md`)                                                                                                                                               |
| Install (packaging)    | `cmake --install` → `${prefix}/${CALFNXT_VST3_INSTALL_DIR}` (default `lib/vst3`); user copy via `./tools/install-user-vst3.sh` `[plugin…]` / `[--dest dir]`                                                                                                                                                         |
| Msg type (TS)          | `calfNXTMsg`                                                                                                                                                                                                                                                                                                        |

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
dsp/limiter/   limiter.plugin.json + DSP + codegen
dsp/harmonics/ harmonics.plugin.json + DSP + codegen
dsp/analyzer/  analyzer.plugin.json + DSP + codegen
dsp/filter/    filter.plugin.json + DSP + codegen
dsp/ringmod/   ringmod.plugin.json + DSP + codegen
dsp/pulsator/  pulsator.plugin.json + DSP + codegen
dsp/crusher/   crusher.plugin.json + DSP + codegen
dsp/phaser/    phaser.plugin.json + DSP + codegen
dsp/flanger/   flanger.plugin.json + DSP + codegen
dsp/chorus/    chorus.plugin.json + DSP + codegen
dsp/split/     split.plugin.json + DSP + codegen
dsp/tuner/     tuner.plugin.json + DSP + codegen
dsp/octaver/   octaver.plugin.json + DSP + codegen
dsp/bender/    bender.plugin.json + DSP + codegen
dsp/impulse/   impulse.plugin.json + DSP + codegen
tools/codegen/ generate_plugin.py → C++ params + TS models
ui/            React SPA (Vite), hash router #equalizer / … / #impulse
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
4. `utils/bind_param.ts` → AWML `DynamicValue.set(plain)`.
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

**React vs AUX (hard rule):** High-rate viz / meter / chart telemetry must **never** drive React
re-renders. Prefer AWML **Bindings** (`backendValue` + `transformReceive` / `map`) on AUX
widget options via `use-aux-widgets` / `bindAuxOptions` (see `Knob` `value$`, EQ band
bindings, History/EQ spectrum `dots`). Custom SVG/canvas charts use `useVizPaint`
(`data$`/`lfo$`/`viz$` → imperative DOM attrs) — never `useDynamicValueReadonly` on a
~30 Hz stream. Manual `DynamicValue.subscribe` → paint is OK when Bindings cannot attach
(canvas Piano-roll / Spectralizer). OK to use React state for rare user/params (spectrum
mode Off/Linear, selected band, etc.).

- Shared `Dsp::IoStage` (`io_stage.h`): `begin()` = in_gain + input peaks; plugin DSP in-place on outs; `end()` = out_gain + output peaks.
- Tap points: **in** after `in_gain`, **out** after processing + `out_gain`.
- Plugin implements `Ui::IVizSource` (usually forwards to `io_`); `EffectBase::createView` → `WebEditor::setVizSource`.
- ~**30 Hz** flush → `{t:"viz",id:"in"|"out",kind:"levels",v:[…]}`.
- Optional host tempo (Delay): `IVizSource::takeHostTempo` / `vizTempoId()` → `{t:"viz",id:"delay",kind:"tempo",v:[valid,bpm]}` → `bindVizTempo`.
- Host also pushes `{t:"io",ch:N}` (bus channel count).
- Header (`createHeaderIo`) binds In/Out MultiMeters + In/Out gain knobs for all plugins.
- Spectrum (Analyzer; shared `SpectrumTap` for later EQ overlay): `{t:"viz",id:"fft",kind:"spectrum",v:[bins,hold,avg…,max…,L…,R…]}`; UI→host `{t:"vizcfg",id:"fft",bins:N}`. Display tilt (Linear / −3 / −4.5 dB/oct) + midband corridor are UI-only. Wire path: binary `CNXV` frames (`viz_bin.h`) → `Float32Array`. When the XEmbed parent is unmapped, `calfnxt-web-host` parks WebKit (`terminate_web_process` + hide) and sends `{t:"_visible",v:0}` so DSP skips viz; on show it reloads the UI. Never block the host UI thread waiting on helper exit.

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
`CALFNXT_WEB_NO_GPU=1` if the embed paints blank/transparent. Opt-in XWayland
Configure nudge: `CALFNXT_XWAYLAND_NUDGE=1` (4× start burst + 33 ms loop;
off by default). Diagnostics always
append to `/tmp/calfnxt-ui.log` (URI misses, JS errors; 512 KiB cap then truncate). Env reference: `README.md`.
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
- Prefer AUX widgets and AWML Bindings (`value$`, `transformReceive`) over React for live UI.
- High-rate viz must not re-render React — AUX/AWML only (see Viz section).
- Avoid drive-by refactors; no fake “cleanup” of the real param/viz/HiDPI fixes above.
- **Widget infos** (`*Info.ts`): detailed, musician/producer tone (effect + sound + when/pitfalls) — see `.cursor/rules/ui-infos-and-mix-filters.mdc` and `transientsInfo.ts` / `compressorInfo.ts`.
- **Dry+filtered Mix**: cancellation-free / complementary LP↔HP (even-order 12/24/48) by default — same rule file; do not ship comb-prone naive dry blend as the Mix default.

---

## Equalizer bands

- Fixed **16** VST slots (`b01_…`…`b16_…`: active/type/slope/freq/gain/q + dyn/dyn_attack/dyn_release/dyn_threshold/dyn_ratio/dyn_listen). No add/remove in UI.
- UI type change keeps per-type gain/Q/slope memory (first visit → safe defaults); host/preset type sync does not rewrite siblings.
- DSP: `common/dsp/biquad.h` (Calf/RBJ) + `eq_band.h` (LP/HP cascade 12/24/36/48 with Q as resonance at fc; Freq/Q/Gain glide) + `compressor.h` (Thor gain reduction for DynEQ).
- **Dynamic EQ** (per band): type-matched detector (BP / LP / HP) → `GainReduction` → `effectiveDb = staticGain + 20*log10(GR)` on peaking/shelf/BP gain. Pass filters keep dyn params but GR does not affect audio until type uses gain.
- **Listen** (`dyn_listen`): solos that band’s detector into the output (EQ bypassed); only one band at a time. Band icon uses `--color-warn` while listening.
- UI curves: handle EqBands use static `gain$`; ghost EqBands + baseline use DSP `effectiveGain$` via viz `{t:"viz",id:"eq",kind:"gains",v:[…]}` (all 16 bands, static or dyn). Host applies gains viz only to live DynEQ bands (and skips no-op dB) so static curves are not redrawn every flush.
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

### Multiband Limiter

- Fixed **6** VST band slots (`b01_…`…`b06_…`: listen/weight/release); `num_bands` 2…6.
- Calf heritage: per-band `LookaheadLimiter` with **weight** + shared **multi-coefficient**
  buffer, then a **broadband** final limiter on the sum (`dsp/mblimiter/`, `lookahead_limiter.h`
  `setMulti` / `pokeMulti`).
- Global master params match Limiter (limit/look/release/ASC/OS/curve/knee/color/TP/hold/emphasis).
- Per-band release is a **relative coefficient** (−1…1) on the master release
  (`rel = master * 0.25^(-coeff)`); weight likewise (`weightLin = 0.25^(-w)`).
- UI: header slope + band −/+ → `MultibandChart` (GR curves, xovers, **no** thresholds)
  → one `BandBridgeChart` → strips (history / In-Out-GR / Rel / Listen / Weight) →
  Limiter-style Limit / Attenuation / Character (incl. Min Release).
- Viz id `"mblimiter"`: `gr` array (N band combined + 1 master), `gains`, `bandio`,
  `envelope` like mbcomp (`[full, band, grLin]` × slots).

### Tuner

- Realtime pitch correction (no Melodyne editor). Voice / Strings / Guitar write knob
  defaults and three hidden DSP values (YIN voiced/unvoiced floors, note-centre LP,
  added-vibrato max cents). Cher snap is Retune / Keep, not a mode.
- Stereo: F0 on Mid (optional L/R/energy Mix), **one** shift ratio, L+R PSOLA grains in lockstep.
- DSP: YIN (`yin_detector.h`) + correction law (`pitch_correct.h`) + linked PSOLA (`psola_shifter.h`).
- Quality maps window/lookahead (PDC). Formant 0…1. Unvoiced (breath/S/bow/pick) is not pitched.
- Scale templates in the UI only write the 12 note bits. Select has a session-only
  **Custom** entry (no rewrite); Key stays unhighlighted until picked; editing any
  note key jumps Scale→Custom and clears Key highlight (no reverse-match from bits).
  MIDI event input: held notes (no sustain) temporarily replace the UI mask by
  pitch class (`common/dsp/midi_note_hold.h`); viz `kind:"midi"` `[active,mask]`;
  Scale/Key change → UI `alloff`. Note markers: `--color-accent` normally,
  `--color-warn` while MIDI overrides.
  Header Voice/Strings/Guitar writes
  range/retune/flex/Keep/formant/unvoiced/octave. Bass uses Guitar + Low toward 31 Hz (B0); Low floor is 25 Hz.
- UI blocks: Notes (scale/key/mask/A4), Detector, Correction, Vibrato. History is full-width.
- Artificial vibrato (UI block): `vib_on` + Depth (`settle`) + Rate + Delay + Fade after lock. Keep (`vibrato`) is preserve-natural.
- Viz id `"tuner"` kind `"pitch"`: `[inMidi, targetMidi, conf, flags, corrCents] × slots + phase`
  (flags: 1 voiced, 2 unvoiced, 4 octave-suspect). Piano-roll widget is display-only.
  kind `"midi"`: `[active, maskBits]` for the note-key marker colour.

### Bender

- Delay-line pitch pedal (no YIN/PSOLA). Linked stereo dual-head read + raised-cosine
  crossfade; ±24 st; Mix is latency-matched dry+wet (unison parks on a single tap).
- UI: huge Pitch knob; Free/ST/WT set snap (0/1/2). DSP quantizes Pitch to that
  grid (semitone / whole-tone) and writes the Parameter so host→UI echo matches.
  Quality Fast/Normal/Smooth/Studio → grain 16/32/64/128 ms (PDC ≈ half).
- Extra: Mix (harmony), Glide (slew), Tone (wet LP). Formant stay-put is *not* the
  point — chipmunk/monster is the vintage sound.

### Impulse

- Convolution reverb (not the algorithmic Reverb plugin). Library folder once
  (`Library…` GTK dialog in `calfnxt-web-host`), recursive WAV + uncompressed
  AIFF/AIFC tree, one-click load on a worker + ~30 ms crossfade.
- Decay 15–100% of captured length (fade + truncate; no stretch). Shape is a
  continuous dB-power (1 linear … 8 hang-then-drop, default 4). 100% = identity, no overlay.
  Same length param as a vertical handle on the Aux Chart waveform.
  Predelay shifts the waveform; chart x-range is IR length + 500 ms.
- Mix is latency-matched (dry delayed by hop 512). HP/LP on **wet only**
  (even-order complementary LR 12/24/48). Reverse, auto peak-normalize
  on load (~−6 dBFS).
- Source (wet only; dry stays stereo): Stereo / L / R / L+R. Mono feed into a
  4-ch true-stereo IR uses both virtual inputs so LL+RL / LR+RR still image.
- Quality Lo/Mid/Hi (default Hi): collapse the IR to mono / stereo L+R /
  true-stereo before the convolver. No extra PDC. Rebuilds like Decay.
- Stereo IR: mono→both; stereo L/R; 4-ch true stereo (L→L, L→R, R→L, R→R).
- Session chunk embeds the raw IR + library root + relative path + open folder
  paths and tree scroll. Last root in `~/.config/calfnxt/impulse-library`.
- Viz id `"impulse"` kind `"wave"`: `[bins, origMs, usedMs, db…]`.
  UI→host `{t:"ir", cmd:"browse"|"select"|"rescan"|"sync"|"ui"}`.

---

## Shelved (not a roadmap)

Ideas only if explicitly revived — do not start these unprompted:

- **Vinyl**
- **Mono Input**
- Optional: **Vocoder** (FIR-based if done)
- Optional: **Crossovers** (dynamic band count if done)

---

## Quick file index

| Concern                     | Files                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor / bridge             | `common/ui/web_editor.{h,cpp}`, `web_host_main.cpp`, `viz_source.h`                                                                                                                                 |
| DSP base / I/O / peaks / EQ | `common/dsp/effect_base.*`, `io_stage.h`, `peak_hold.h`, `biquad.h`, `eq_band.h`, `compressor.h`                                                                                                    |
| Reference (WebView/params)  | `examples/auxvst/` (call it **auxvst**, not MDA)                                                                                                                                                    |
| Equalizer DSP               | `dsp/equalizer/source/*_dsp.*`                                                                                                                                                                      |
| Stereo DSP                  | `dsp/stereo/source/*_dsp.*`                                                                                                                                                                         |
| Transients DSP              | `dsp/transients/source/*_dsp.*`, `common/dsp/transients.h`                                                                                                                                          |
| Compressor DSP              | `dsp/compressor/source/*_dsp.*`, `common/dsp/compressor.h`, `common/dsp/sidechain_filter.h`                                                                                                         |
| Expander DSP                | `dsp/expander/source/*_dsp.*`, `common/dsp/expander.h`, `common/dsp/sidechain_filter.h`                                                                                                             |
| DeEsser DSP                 | `dsp/deesser/source/*_dsp.*`, `common/dsp/deesser_detector.h`, `common/dsp/band_splitter.h` (Ess/Rumble target)                                                                                     |
| Delay DSP                   | `dsp/delay/source/*_dsp.*`, `common/dsp/sidechain_filter.h`, `common/dsp/smooth_gain.h`                                                                                                             |
| Reverb DSP                  | `dsp/reverb/source/*_dsp.*`, `common/dsp/reverb_*.h`, `common/dsp/delay_line.h`                                                                                                                     |
| Multiband Compressor        | `dsp/mbcomp/source/*_dsp.*`, `common/dsp/band_splitter.h`, `common/dsp/compressor.h`; UI `ui/src/plugins/MbcompUI/*`, `host/mbcompHost.ts`, `widgets/MultibandChart/*`, `widgets/BandBridgeChart/*` |
| Limiter                     | `dsp/limiter/source/*_dsp.*`, `common/dsp/lookahead_limiter.h`, `common/dsp/resample_n.h`; UI `ui/src/plugins/LimiterUI/*`, `host/limiterHost.ts`                                                   |
| Multiband Limiter           | `dsp/mblimiter/source/*_dsp.*`, `band_splitter.h`, `lookahead_limiter.h`; UI `ui/src/plugins/MblimiterUI/*`, `host/mblimiterHost.ts`                                                                |
| Harmonics                   | `dsp/harmonics/source/*_dsp.*`, `common/dsp/tap_distortion.h`; UI `ui/src/plugins/HarmonicsUI/*`, `host/harmonicsHost.ts`                                                                           |
| Analyzer                    | `dsp/analyzer/source/*_dsp.*`, `common/dsp/fft_r2.h`, `common/dsp/spectrum_tap.h`; UI `ui/src/plugins/AnalyzerUI/*`, `host/analyzerHost.ts`, `widgets/SpectrumChart/*`                              |
| Filter DSP                  | `dsp/filter/source/*_dsp.*`, `common/dsp/multimode_filter.h`, `common/dsp/inertia.h`, `common/dsp/midi_note_hold.h` (MIDI → cutoff)                                                                  |
| MIDI note hold (shared)     | `common/dsp/midi_note_hold.h`, UI `ui/src/utils/midi.ts` (`postMidiAllOff`); Tuner mask + Filter Hz                                                                                                         |
| Ring Modulator DSP          | `dsp/ringmod/source/*_dsp.*`, `common/dsp/simple_lfo.h`                                                                                                                                             |
| Pulsator DSP                | `dsp/pulsator/source/*_dsp.*`, `common/dsp/simple_lfo.h`                                                                                                                                            |
| Crusher DSP                 | `dsp/crusher/source/*_dsp.*`, `common/dsp/bitreduction.h`; UI `ui/src/plugins/CrusherUI/*`, `widgets/CrusherChart/*`                                                                                 |
| Phaser DSP                  | `dsp/phaser/source/*_dsp.*`, `common/dsp/simple_phaser.h`; UI `ui/src/plugins/PhaserUI/*`, `widgets/ModulationChart/*` (shared L/R response for Flanger)                                      |
| Flanger DSP                 | `dsp/flanger/source/*_dsp.*`, `common/dsp/simple_flanger.h`; UI `ui/src/plugins/FlangerUI/*`                                                                                                          |
| Chorus DSP                  | `dsp/chorus/source/*_dsp.*`, `common/dsp/simple_chorus.h`; UI `ui/src/plugins/ChorusUI/*`, `widgets/ChorusChart/*` (LFO position panels, not ModulationChart)                                      |
| Split DSP                   | `dsp/split/source/*_dsp.*`; UI `ui/src/plugins/SplitUI/*`, `host/splitHost.ts`                                                                                                                     |
| Tuner DSP                   | `dsp/tuner/source/*_dsp.*`, `common/dsp/yin_detector.h`, `pitch_correct.h`, `psola_shifter.h`; UI `ui/src/plugins/TunerUI/*`, `host/tunerHost.ts`, `widgets/PitchRollChart/*`                      |
| Octaver DSP                 | `dsp/octaver/source/*_dsp.*`, `common/dsp/octaver_pitch_law.h`, `yin_detector.h`, `psola_shifter.h`, `sub_harmonic.h`; UI `ui/src/plugins/OctaverUI/*`, `host/octaverHost.ts`, `widgets/PitchRollChart/*` |
| Bender DSP                  | `dsp/bender/source/*_dsp.*`, `common/dsp/bender_shifter.h`; UI `ui/src/plugins/BenderUI/*`, `host/benderHost.ts`                                                                                        |
| Impulse DSP                 | `dsp/impulse/source/*_dsp.*`, `common/dsp/partitioned_convolver.h`, `wav_load.h`, `ir_library.h`; UI `ui/src/plugins/ImpulseUI/*`, `host/impulseHost.ts`, `widgets/ImpulseChart/*`                     |
| Param bind                  | `ui/src/utils/bridge.ts`, `ui/src/utils/bind_param.ts`, `host/*Host.ts`                                                                                                                              |
| Header I/O                  | `ui/src/components/Header/*`, `host/headerMeters.ts`                                                                                                                                                |
| Meters                      | `ui/src/widgets/MultiMeter/*`, `LevelMeter/*`                                                                                                                                                       |
| Codegen                     | `tools/codegen/generate_plugin.py`                                                                                                                                                                  |
| Release / SemVer            | `VERSIONING.md`, `tools/release.sh`                                                                                                                                                                 |
