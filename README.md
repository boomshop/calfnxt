# calfNXT

<p align="center">
  <img src="calfNXT.svg" alt="calfNXT" width="320" />
</p>

**calfNXT** is the successor to [Calf Studio Gear](https://calf-studio-gear.org):
a greenfield **VST3** plugin suite with a React + AUX web UI (Linux first).
WebKitGTK runs in a separate **`calfnxt-web-host`** process (X11 embed) so the
plugin `.so` stays free of GTK — required for hosts like Ardour. Parts of the
classic Calf DSP are reused but substantially reworked; more processors will
follow over time.

Project site: [https://calfnxt.org](https://calfnxt.org/)

Branding / namespace: **calfNXT**. Shared React SPA UI, packed per plugin into
each `.vst3` bundle’s `Resources/`.

This project is free software licensed under the **GNU General Public License
v3 or later** — see [`LICENSE`](LICENSE) and [`COPYRIGHT`](COPYRIGHT).

For architecture and agent handoff, see [`ARCHITECTURE.md`](ARCHITECTURE.md)
and [`AGENTS.md`](AGENTS.md).

---

## Plugins

Early public preview (**Linux + X11** hosts). More processors from classic Calf
will follow.

| Plugin | Bundle | Role |
|--------|--------|------|
| **Equalizer** | `calfNXTEqualizer.vst3` | 16-band parametric / dyn EQ |
| **Stereo** | `calfNXTStereo.vst3` | Width, M/S, decorrelation, imaging |
| **Transients** | `calfNXTTransients.vst3` | Attack / release shaping |
| **Compressor** | `calfNXTCompressor.vst3` | Feed-forward dynamics (threshold / ratio / knee) |
| **DeEsser** | `calfNXTDeesser.vst3` | Sibilance control (Wide / Split) |

### Equalizer

- Fixed **16 bands** (peaking, shelves, LP/HP with 12/24/36/48 dB slopes, band-pass)
- Per-band **Dynamic EQ** (detector-matched GR on peaking / shelves / BP)
- **Listen** solos one band’s detector into the output
- Interactive frequency response (static handles + dyn effective-gain ghosts)
- Shared In/Out gain + peak meters

### Stereo

- Mode matrix (LR↔MS, mono folds, L/R swap, …) with live bus labels
- Mid/Side level & pan/balance, optional **decorrelator** (amount, xover, slope, stages, spread)
- Per-channel mute / phase, stereo delay, base width, stereo phase, output balance
- **Goniometer** + correlation meter

### Transients

- Independent **attack / release** boost with time constants and sustain threshold
- Optional **lookahead** (reported to the host for PDC; wet/dry stay in phase)
- Detector **HP/LP** (12/24/36/48 dB) + listen; wet/dry **mix**
- Live **envelope chart** (input / output / envelope overlays, selectable display window)

### Compressor

- Calf-heritage **feed-forward** gain reduction (shared `GainReduction` with DynEQ)
- **Peak / RMS / Opto** detector modes; **Max / Avg / Mid** stereo link; adjustable **PDR**
- Sidechain **HP/LP** (shared `SidechainFilter` + `FrequencyRange` UI) with listen
- Threshold, ratio, soft **knee**, attack / release, makeup, wet/dry **mix**, bypass
- **GR meter** + AUX transfer curve with live DSP operating point
- Scrolling **history** chart (audio peak + GR over time, selectable window)

### DeEsser

- Calf-heritage sibilance control: **Wide** (full-band GR) or **Split** (Linkwitz-Riley high band only)
- Detection chain: multi-slope **HP** (12/24/48 dB, resonant Q) + **peaking** EQ; Peak / RMS / Opto
- Threshold, ratio, **laxity** (attack/release), makeup, listen (detector solo)
- **GR meter** + history (input / filtered detector / GR)
- Shared In/Out gain + peak meters

---

## License

calfNXT is released under the **GNU GPL version 3 (or later)**.

- Full license text: [`LICENSE`](LICENSE)
- Copyright, warranty disclaimer, and third-party notes: [`COPYRIGHT`](COPYRIGHT)

DSP heritage from Calf Studio Gear (LGPL-2.1) is used under the GPL as
permitted by the LGPL. UI building blocks include GPL-licensed
`@deutschesoft/aux-widgets` / AWML.

---

## Dependencies

Target platform today: **Linux + X11** (the editor forces the GDK X11 backend for host embedding).

### Tools

| Tool | Role | Notes |
|------|------|--------|
| **CMake** ≥ 3.25 | Build | |
| **C/C++ toolchain** (GCC or Clang) | Compile plugins | C++17 |
| **pkg-config** | Find GTK / WebKit | |
| **Python 3** | Parameter codegen | Interpreter only |
| **Node.js** + **npm** | React / Vite UI | Required for a normal UI build |

Optional: **Ninja** (faster CMake generator).

### System libraries (pkg-config)

CMake requires these modules (see root `CMakeLists.txt`):

| pkg-config id | Purpose |
|---------------|---------|
| `gtk+-3.0` | GtkPlug / X11 embed (**only** in `calfnxt-web-host`, not the `.so`) |
| `webkit2gtk-4.1` | WebKitGTK editor in `calfnxt-web-host` |

Related runtime pieces (usually pulled in as dependencies of the packages above): GLib, GObject, Cairo, Soup, X11.

### Steinberg VST3 SDK

The SDK lives at `external/vst3sdk/` and is **not** always shipped inside this git tree (it is large). After cloning calfNXT, clone the SDK there if missing:

```bash
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk
# Optional pin, e.g.:
#   git -C external/vst3sdk checkout v3.8.0_build_66
#   git -C external/vst3sdk submodule update --init --recursive
```

VSTGUI is **disabled** in this project (`SMTG_ENABLE_VSTGUI_SUPPORT=OFF`); you only need the core SDK sources that CMake already pulls in.

### npm packages (UI)

Installed automatically when CMake builds the UI (`npm install` in `ui/`), or manually:

```bash
cd ui && npm install
```

Main UI stack: React, Vite, TypeScript, Sass, `@deutschesoft/aux-widgets`, `@deutschesoft/awml`, `@deutschesoft/use-aux-widgets`.

### Distro package examples

**Arch / CachyOS** (headers ship with the runtime packages):

```bash
sudo pacman -S --needed \
  base-devel cmake ninja pkgconf python \
  nodejs npm \
  gtk3 webkit2gtk-4.1
```

**Debian / Ubuntu** (names vary slightly by release; you need the `-dev` packages):

```bash
sudo apt update
sudo apt install --no-install-recommends \
  build-essential cmake ninja-build pkg-config python3 \
  nodejs npm \
  libgtk-3-dev libwebkit2gtk-4.1-dev
```

If `pkg-config --exists webkit2gtk-4.1` fails, install the matching WebKitGTK 4.1 development package for your distro (do **not** substitute `webkit2gtk-4.0` — CMake asks for **4.1**).

### Host for testing

Any VST3 host that loads `~/.vst3` (e.g. **Carla**, Ardour). Not required to compile.

---

## Getting started (fresh clone)

```bash
git clone <this-repo-url> calfnxt
cd calfnxt

# VST3 SDK (if not already present)
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk

cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target calfnxt-plugins -j
# or: ./tools/install-user-vst3.sh  (force-rebuilds UI + embeds + installs)
cmake --build build --target install-user-vst3
```

Then rescan plugins in your host. Bundles appear as:

| Plugin    | Path                         |
|-----------|------------------------------|
| Equalizer | `~/.vst3/calfNXTEqualizer.vst3` |
| Stereo    | `~/.vst3/calfNXTStereo.vst3`    |
| Transients | `~/.vst3/calfNXTTransients.vst3` |
| Compressor | `~/.vst3/calfNXTCompressor.vst3` |
| DeEsser   | `~/.vst3/calfNXTDeesser.vst3`   |

---

## Build and install (what hosts actually load)

Hosts such as Carla load plugins from `~/.vst3/`, **not** from the CMake build tree alone.  
After UI or DSP changes you typically need: **build → embed UI into Resources → install to `~/.vst3`**.

### Full rebuild (DSP + plugins + UI embed)

```bash
cmake --build build --target calfnxt-plugins -j
cmake --build build --target install-user-vst3
# equivalent shortcut (also clears UI stamps so Resources always refresh):
#   ./tools/install-user-vst3.sh
```

`calfnxt-plugins` builds **every** plugin (Equalizer, Stereo, Transients, Compressor, DeEsser, …) and embeds each
UI pack. `install-user-vst3` then copies the bundles into `~/.vst3/`:

| Plugin    | Path                         |
|-----------|------------------------------|
| Equalizer | `~/.vst3/calfNXTEqualizer.vst3` |
| Stereo    | `~/.vst3/calfNXTStereo.vst3`    |
| Transients | `~/.vst3/calfNXTTransients.vst3` |
| Compressor | `~/.vst3/calfNXTCompressor.vst3` |
| DeEsser   | `~/.vst3/calfNXTDeesser.vst3`   |

Rescan / reload the plugins in the host after install.

### UI-only changes (React / SCSS / widgets)

A Vite build **alone** does **not** update what the VST editor shows.  
You must copy the SPA into each bundle’s `Resources/`:

```bash
./tools/install-user-vst3.sh
# or manually:
cmake --build build --target calfnxt-equalizer-resources calfnxt-stereo-resources calfnxt-transients-resources calfnxt-compressor-resources calfnxt-deesser-resources -j
cmake --build build --target install-user-vst3
```

The `*-resources` targets run `npm run build` in `ui/` (MPA entries + per-plugin
packs under `ui/dist/plugins/<id>/`) and embed only that plugin’s assets.

### DSP / C++ only

```bash
cmake --build build --target calfnxt-plugins -j
cmake --build build --target install-user-vst3
```

Re-run `*-resources` (or `./tools/install-user-vst3.sh`) as well if the UI also changed.

---

## Browser / HMR development (not the VST embed)

```bash
cd ui && npm install   # once
cd ui && npm run dev
```

Open e.g. http://localhost:5173/#equalizer · `#stereo` · `#transients` · `#compressor` · `#deesser` 

This is useful for layout and widget work. It does **not** replace installing into `~/.vst3` for Carla / other hosts.

---

## Quick reference

| Goal                         | Command |
|-----------------------------|---------|
| Configure                   | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release` |
| Build **all** plugins (+ UI)| `cmake --build build --target calfnxt-plugins -j` |
| Embed SPA + install         | `./tools/install-user-vst3.sh` or `cmake --build build --target install-user-vst3` |
| Single plugin (Equalizer)   | `cmake --build build --target calfnxt-equalizer calfnxt-equalizer-resources -j` |
| Single plugin (Stereo)      | `cmake --build build --target calfnxt-stereo calfnxt-stereo-resources -j` |
| Single plugin (Transients)  | `cmake --build build --target calfnxt-transients calfnxt-transients-resources -j` |
| Single plugin (Compressor)  | `cmake --build build --target calfnxt-compressor calfnxt-compressor-resources -j` |
| Single plugin (DeEsser)     | `cmake --build build --target calfnxt-deesser calfnxt-deesser-resources -j` |
| UI HMR in the browser       | `cd ui && npm run dev` |

---

## Notes

- Codegen runs as part of the CMake plugin targets (`dsp/<id>/<id>.plugin.json` → C++ params + `ui/src/generated/`).
- Install also removes obsolete `calfNXTVolume.vst3` / `calfNXTBalance.vst3` / `calfNXTStereoTools.vst3` if still present from earlier builds.
- Env flags: `CALFNXT_WEB_DEBUG`, `CALFNXT_WEB_INSPECTOR`, `CALFNXT_UI_SCALE`, `CALFNXT_WEB_NO_GPU`, `CALFNXT_WEB_GPU` (see `AGENTS.md`).
- The editor UI runs **out-of-process** (`calfnxt-web-host` next to the `.so`) so Ardour does not load GTK3 into its process. Embed is still X11 `GtkPlug`; Wayland-only sessions may need `GDK_BACKEND=x11` for the host/helper.
