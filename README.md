# calfNXT

<p align="center">
  <img src="calfNXT.svg" alt="calfNXT" width="320" />
</p>

**calfNXT** is the successor to [Calf Studio Gear](https://calf-studio-gear.org):
a **VST3** plugin suite with a React + AUX web UI (**Linux + X11**). WebKitGTK
runs in a separate **`calfnxt-web-host`** process (X11 embed) so the plugin `.so`
stays free of GTK — required for hosts like Ardour. Classic Calf DSP heritage is
reused where it fits, substantially reworked for this stack.

- Site: [https://calfnxt.org](https://calfnxt.org/)
- Branding / namespace: **calfNXT** (shared SPA packed per plugin into each
  `.vst3` `Resources/`)
- License: **GNU GPL v3 or later** — [`LICENSE`](LICENSE), [`COPYRIGHT`](COPYRIGHT)
- Architecture / agent handoff: [`ARCHITECTURE.md`](ARCHITECTURE.md),
  [`AGENTS.md`](AGENTS.md)
- Suite SemVer: [`VERSIONING.md`](VERSIONING.md)

### Scope

This project is a curated set of audio processors for my personal studio workflow. To avoid
the maintenance overhead common in larger plugin suites (like the classic Calf ecosystem),
this project remains strictly focused on VST3 and Linux. Bug reports and packaging support are
welcome. However, to keep the project manageable, feature requests or PRs outside my personal
scope might be declined without going into lengthy discussions. Forking is highly encouraged
if you want to take the code in a new direction!

DSP heritage from Calf (LGPL-2.1) is used under the GPL as permitted by the LGPL.
UI building blocks include GPL-licensed `@deutschesoft/aux-widgets` / AWML.

---

## Plugins

Install paths are always `~/.vst3/<Bundle>` (or `$CALFNXT_VST3_DIR` /
`cmake --install` — see [Build and install](#build-and-install)). Every effect
shares **In/Out gain + peak meters** in the header (not repeated below).

### Dynamics

| Plugin | Bundle | Highlights |
|--------|--------|------------|
| **Compressor** | `calfNXTCompressor.vst3` | Feed-forward GR; Peak/RMS/Opto; stereo sidechain bus; HP/LP + listen; history |
| **Expander** | `calfNXTExpander.vst3` | Downward expander/gate; stereo sidechain bus; hysteresis + hold; dual transfer curves |
| **Multiband Compressor** | `calfNXTMbcomp.vst3` | 2–6 LR bands; per-band dynamics; Mono; response + history |
| **Limiter** | `calfNXTLimiter.vst3` | Lookahead brickwall; ASC; OS 1–4×; True Peak; Diff Listen |
| **Multiband Limiter** | `calfNXTMblimiter.vst3` | Weighted multi-band brickwall + final limiter; Mono |
| **DeEsser** | `calfNXTDeesser.vst3` | Ess/Rumble; Wide/Split; detector HP/LP + peaking; history |
| **Transients** | `calfNXTTransients.vst3` | Attack/release shaper; sensitivity; lookahead; HP/LP; envelope history |

### EQ & filter

| Plugin | Bundle | Highlights |
|--------|--------|------------|
| **Equalizer** | `calfNXTEqualizer.vst3` | 16-band parametric / dyn EQ; Listen; Mono; interactive response |
| **Filter** | `calfNXTFilter.vst3` | Multimode LP/HP/BP/BR/AP; optional envelope; Mono; spectrum overlay |

### Harmonics

| Plugin | Bundle | Highlights |
|--------|--------|------------|
| **Harmonics** | `calfNXTHarmonics.vst3` | Saturator / Exciter / Bass; Feed→shape→Post; Drive/Blend/Asym/Tone/OS |
| **Crusher** | `calfNXTCrusher.vst3` | Bit crusher; response heat chart |

### Delay & reverb

| Plugin | Bundle | Highlights |
|--------|--------|------------|
| **Delay** | `calfNXTDelay.vst3` | Dual delay (Stereo/Ping-Pong/L-R); tempo sync; echo charts |
| **Reverb** | `calfNXTReverb.vst3` | Algorithmic ER + late (no IR); duck/gate/freeze; room presets |

### Modulators

| Plugin | Bundle | Highlights |
|--------|--------|------------|
| **Ring Modulator** | `calfNXTRingmodulator.vst3` | Stereo ring mod; dual LFOs; live effective knobs |
| **Pulsator** | `calfNXTPulsator.vst3` | Tremolo / autopanner; tempo sync; dual-phase LFO chart |
| **Phaser** | `calfNXTPhaser.vst3` | Allpass phaser; LFO freeze/Reset; live L/R response chart |
| **Flanger** | `calfNXTFlanger.vst3` | Delay comb + feedback; LFO freeze/Reset; comb peak/notch chart |
| **Chorus** | `calfNXTChorus.vst3` | Multi-tap (≤8 voices); LFO position charts; post FrequencyRange |

### Tools

| Plugin | Bundle | Highlights |
|--------|--------|------------|
| **Analyzer** | `calfNXTAnalyzer.vst3` | Spectrum + spectralizer + gonio/correlation (passthrough) |
| **Stereo** | `calfNXTStereo.vst3` | Width, M/S, decorrelator, imaging; gonio + correlation |
| **Split** | `calfNXTSplit.vst3` | Mono in → stereo out; per-channel volume, mute, phase invert |

Site and per-plugin descriptors: [calfnxt.org](https://calfnxt.org/),
`dsp/<id>/<id>.plugin.json`.

---

## Dependencies

Target: **Linux + X11** (the editor forces the GDK X11 backend for host embedding).

### Tools

| Tool | Role |
|------|------|
| **CMake** ≥ 3.25 | Build |
| **GCC or Clang** (C++17) | Compile |
| **pkg-config** | Find GTK / WebKit |
| **Python 3** | Parameter codegen |
| **Node.js** + **npm** | React / Vite UI (not needed with `CALFNXT_USE_PREBUILT_UI=ON`) |

Optional: **Ninja**.

### System libraries (pkg-config)

| Module | Purpose |
|--------|---------|
| `gtk+-3.0` | GtkPlug / X11 embed (**only** in `calfnxt-web-host`, not the `.so`) |
| `webkit2gtk-4.1` | WebKitGTK in `calfnxt-web-host` (do **not** substitute 4.0) |

Usually pulled in as deps: GLib, GObject, Cairo, Soup, X11.

**Arch / CachyOS:**

```bash
sudo pacman -S --needed base-devel cmake ninja pkgconf python nodejs npm gtk3 webkit2gtk-4.1
```

**Debian / Ubuntu:**

```bash
sudo apt install --no-install-recommends \
  build-essential cmake ninja-build pkg-config python3 nodejs npm \
  libgtk-3-dev libwebkit2gtk-4.1-dev
```

Host for testing (e.g. **Carla**, Ardour) is not required to compile.

### Steinberg VST3 SDK

Lives at `external/vst3sdk/` (often not in this git tree). If missing:

```bash
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk
# Optional pin, e.g. v3.8.0_build_66 + submodule update --init --recursive
```

VSTGUI is disabled (`SMTG_ENABLE_VSTGUI_SUPPORT=OFF`).

### npm (UI)

CMake runs `npm ci` in `ui/` when `node_modules` is missing, otherwise
`npm run build` only. Manual: `cd ui && npm ci`. Stack: React, Vite, TypeScript,
Sass, `@deutschesoft/aux-widgets`, `awml`, `use-aux-widgets`.

### Packaging / offline UI

`ui/dist` is **not** in git. Each GitHub Release ships a **prebuilt UI tarball**.

1. **Source0** — sources for tag `vX.Y.Z`
2. **Source1** — `calfnxt-X.Y.Z-ui-dist.tar.xz` (+ `.sha256`)
3. Unpack Source1 at the **source tree root** so `ui/dist/` (incl. `.stamp`) appears
4. Configure without Node:

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCALFNXT_USE_PREBUILT_UI=ON
cmake --build build --target calfnxt-plugins -j
DESTDIR=/tmp/pkgroot cmake --install build --prefix /usr
# optional: -DCALFNXT_VST3_INSTALL_DIR=lib64/vst3
```

Fetching Source0/Source1 before the build is fine; `npm` / registry access during
`%build` must stay offline. The VST3 SDK remains a separate dependency.

Release helper (bump, tag, ui-dist asset, GitHub Release):

```bash
./tools/release.sh          # asks for the new version
./tools/release.sh minor    # or patch / major / X.Y.Z
```

See [`VERSIONING.md`](VERSIONING.md).

---

## Build and install

Hosts load plugins from `~/.vst3/` (or a packaging prefix) — **not** from the
CMake build tree alone. Flow after DSP/UI changes: **build → embed UI into
`Resources/` → install**.

### Fresh clone

```bash
git clone <this-repo-url> calfnxt && cd calfnxt
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk

cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
./tools/install-user-vst3.sh          # all plugins → ~/.vst3 (UI rebuild + embed + copy)
# or stepwise:
#   cmake --build build --target calfnxt-plugins -j
#   cmake --build build --target install-user-vst3
```

Then rescan in the host. Bundles: `~/.vst3/calfNXTEqualizer.vst3`, …
`calfNXTChorus.vst3`, … (names match the [Plugins](#plugins) table).

### Day-to-day

| Goal | Command |
|------|---------|
| All plugins + embed + `~/.vst3` | `./tools/install-user-vst3.sh` |
| One plugin (fast iterate) | `./tools/install-user-vst3.sh mbcomp` |
| Custom dest | `./tools/install-user-vst3.sh --dest /usr/lib/vst3 mbcomp` |
| UI pack only (no install) | `cd ui && npm run build -- mbcomp` (omit id = all) |
| DSP/C++ only, then install | `cmake --build build --target calfnxt-plugins -j` then `install-user-vst3` / the script |
| System install (packaging) | `cmake --install build --prefix /usr` → `$prefix/lib/vst3` |
| Single cmake targets | `cmake --build build --target calfnxt-<id> calfnxt-<id>-resources -j` then `install-user-vst3-copy` |

A Vite build **alone** does not update the VST editor — Resources must be
re-embedded (the install script does that). Plugin ids for the script / Vite:
`equalizer` `stereo` `transients` `compressor` `expander` `deesser` `delay`
`reverb` `mbcomp` `limiter` `mblimiter` `harmonics` `analyzer` `filter`
`ringmod` `pulsator` `crusher` `phaser` `flanger` `chorus` `split`.

Codegen is part of the CMake plugin targets (`dsp/<id>/<id>.plugin.json` → C++
params + `ui/src/generated/`).

### Browser HMR (not the VST embed)

```bash
cd ui && npm install   # once
cd ui && npm run dev   # e.g. http://localhost:5173/#chorus
```

Useful for layout/widgets; does **not** replace `~/.vst3` for hosts.

### Website screenshots (optional)

```bash
cd studio && npm install    # once (Chromium)
npm run studio              # from repo root — all / one plugin
```

See [`studio/README.md`](studio/README.md).

---

## Environment variables

Boolean-style flags are **on** when set to any non-empty value (e.g. `1`).
Editor / WebKit vars must be in the **plugin host** environment (`calfnxt-web-host`
inherits via `posix_spawn`). Example: `CALFNXT_WEB_DEBUG=1 carla …`.

### Editor / WebKit (`calfnxt-web-host`)

| Variable | Values | Effect |
|----------|--------|--------|
| `CALFNXT_UI_SCALE` | float ≈ `0.05`…`8` | Force editor scale (HiDPI) instead of measuring CSS vs host pixels. Invalid → ignored. |
| `CALFNXT_WEB_DEBUG` | non-empty | Extra stderr logging; WebKit developer extras + console→stdout. Always also logs to `/tmp/calfnxt-ui.log`. |
| `CALFNXT_WEB_INSPECTOR` | non-empty | Open WebKit Inspector on editor load. |
| `CALFNXT_WEB_NO_GPU` | non-empty | Hardware accel **off** (`NEVER`). Default is **on** (`ALWAYS`). Use if the embed paints blank. |
| `CALFNXT_XWAYLAND_NUDGE` | non-empty | Opt-in GNOME/Mutter + Ardour on Wayland workaround. **Off by default.** See [Editor black or frozen on GNOME/Wayland](#editor-black-or-frozen-on-gnomewayland). |

Related (not calfNXT-owned):

| Variable | Notes |
|----------|--------|
| `GDK_BACKEND=x11` | Force X11 for the helper on Wayland-only sessions. |
| `WEBKIT_DISABLE_DMABUF_RENDERER` | Blank-window workaround on some drivers; set yourself if needed. |
| `WEBKIT_DISABLE_COMPOSITING_MODE` | Last-resort compositing disable; not set by calfNXT. |
| `DISPLAY` | Required for the X11 `GtkPlug` embed. |

### Install helpers

| Variable | Effect |
|----------|--------|
| `CALFNXT_VST3_DIR` | Dest for user install (default `~/.vst3`). |
| `BUILD_DIR` | Build tree for `./tools/install-user-vst3.sh` (default `<repo>/build`). |
| `JOBS` | Parallelism for that script (default `nproc`). |

### CMake options (`-D`, not `getenv`)

| Option | Effect |
|--------|--------|
| `CALFNXT_USE_PREBUILT_UI=ON` | Use unpacked `ui/dist` (needs `.stamp`); no `npm` during build. |
| `CALFNXT_VST3_INSTALL_DIR` | Path under prefix for `cmake --install` (default `${CMAKE_INSTALL_LIBDIR}/vst3`). |
| `CALFNXT_USER_VST3_DIR` | Cache default for user-copy when `CALFNXT_VST3_DIR` is unset. |

---

## Editor black or frozen on GNOME/Wayland

Long form of `CALFNXT_XWAYLAND_NUDGE`. **VST3 Linux editors are X11-only.** On
GNOME Wayland that embed runs under **XWayland**. Mutter often only commits the
parent Wayland surface on a real **Configure** (window resize). WebKit has
already painted; the compositor does not show new buffers until then.

The workaround is **opt-in** and **off by default**. Native GNOME on Xorg, and
Qt hosts such as Carla, typically do not need it.

### Symptoms

On **Ardour** under **GNOME/Mutter on Wayland** (Debian Trixie, Ubuntu 26.04):

1. Plugin loads; editor opens at design size.
2. Surface stays **black** until you **resize** the editor.
3. After that, knobs/meters/UI only update on the **next** resize. Host→DSP still
   works; **pixels** stay stale.

Fine in: browser HMR, **GNOME on Xorg**, **Carla** on Wayland.

`/tmp/calfnxt-ui.log` can look healthy without the workaround (`force-alloc`,
`map-ok`, `load-finished`, correct viewport). This is **not** a missing package,
failed UI build, or React loading flash. `kids=0` in `_diag` is a red herring
(probe can run before React mounts).

### Why

Hosts hand an **X11 embed window ID**. calfNXT must not link GTK/WebKit into the
`.so` (Ardour toolkit collision), so **`calfnxt-web-host`** does GtkPlug +
WebKit, XEmbedded into that XID, JSON over a socketpair. On Wayland that tree is
under **XWayland**. Pixels exist; the parent `wl_surface` present fails without
Configure. Resize generates Configure — hence “just resize it.”

JUCE 8’s Linux WebView is the same class of stack. A proper fix belongs in
Mutter/XWayland, WebKitGTK/GDK, or a native Wayland VST3 view ABI — not an
app-side hack that can be on for everyone.

### What did not help

Tried and either useless or harmful on working hosts: defaulting DMA-BUF/GPU off;
`WEBKIT_DISABLE_COMPOSITING_MODE`; frame-sync / frame-clock tricks; expose
without a size change; `XResizeWindow` on the **host’s** foreign parent
(`BadAccess`). Vars in `~/.bashrc` do **not** reach Ardour started from GNOME
overview — the helper inherits the **host** `environ`. If the log shows
`xwayland_nudge=(unset)`, the flag never arrived.

### Workaround: `CALFNXT_XWAYLAND_NUDGE`

Set any non-empty value in the **plugin host** environment. Then
`calfnxt-web-host`:

1. After `load-finished`, four **Configure bursts** (~80 ms): 1px
   `gdk_window_resize` bump on GtkPlug + WebKit (`nudge cfg-1` … `cfg-4`) — usually
   enough for first paint.
2. A **33 ms live loop** (`nudge live-cfg 33ms`) for the editor lifetime so
   knobs/viz keep presenting.

Without the flag, behavior matches a build that never had this code. Cost:
**CPU / WebKit relayout** of a full SPA — leave unset on Xorg, Carla, and hosts
that already present. Testers have not reported visible flicker from the 1px bump.

**One session** (close Ardour first):

```bash
CALFNXT_XWAYLAND_NUDGE=1 ardour8   # or ardour9
```

**Session-wide** (GNOME-started hosts): `~/.config/environment.d/calfnxt.conf`

```text
CALFNXT_XWAYLAND_NUDGE=1
```

Then **log out and back in**. Confirm in `/tmp/calfnxt-ui.log`: `xwayland_nudge=1`
and `nudge cfg-*` / `live-cfg`. Optional: `GDK_BACKEND=x11`, `CALFNXT_WEB_DEBUG=1`.
