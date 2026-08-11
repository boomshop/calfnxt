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
and [`AGENTS.md`](AGENTS.md). Suite SemVer rules: [`VERSIONING.md`](VERSIONING.md).

### Scope

calfNXT is a **personal studio project**: plugins I need for my own work, built
in spare time — not a product roadmap or a community product org. If it helps
you too, great; if not, that’s fine. Bug reports and distro packaging help are
welcome. Feature requests and pull requests for things outside this VST3/Linux
scope (or that I simply don’t need) may be declined without a long debate —
forking is explicitly encouraged. That narrower focus is intentional; classic
Calf’s “take every request” culture is one of the things this project is trying
not to repeat.

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
| **Delay** | `calfNXTDelay.vst3` | Dual delay (Stereo / Ping-Pong / L-R) |
| **Reverb** | `calfNXTReverb.vst3` | Algorithmic room (ER + late, no IR) |

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

### Delay

- Calf-heritage dual delay: **Stereo** / **Ping-Pong** / **L then R** / **R then L**
- Timing: linked **Tempo** ↔ **Beat ms**, optional **Host Sync** (shows host BPM), **Tap Tempo**
- **Subdivide** + Time L/R; feedback, wet/dry levels, stereo width
- **Active** gates delay-line input only (trails ring out)
- Feedback **FrequencyRange** (HP/LP)
- Predictive L/R **echo charts** (DSP-matched levels, hybrid time window, fixed bar width)
- Shared In/Out gain + peak meters

### Reverb

- Algorithmic go-to room (no impulse responses): improved Calf **allpass-loop late** + switchable **Early Reflections**
- ER modes: **Multi-Tap** / **Velvet**; path **Parallel** or **Serial** (ER→Late)
- Continuous **room size** (meters), **distance** macro, ms/SR-correct delays, predelay **on late only**
- Pre-late **diffusion**, HF/LF damp, air shelf, mod rate/depth
- Wet **width**: Mid/Side, Haas, or decorrelate
- **Duck**, **Gate** (hold/release), **Freeze**
- AUX **Reverb** chart (dry / ER / predelay / late) + room presets (Booth / Room / Chamber / Hall / Plate / Arena / Gated)
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
| **Node.js** + **npm** | React / Vite UI | Required for a normal UI build; not needed with `CALFNXT_USE_PREBUILT_UI=ON` |

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

Installed automatically when CMake builds the UI (`npm ci` in `ui/` when
`node_modules` is missing, otherwise `npm run build` only), or manually:

```bash
cd ui && npm ci
```

Main UI stack: React, Vite, TypeScript, Sass, `@deutschesoft/aux-widgets`, `@deutschesoft/awml`, `@deutschesoft/use-aux-widgets`.

### Packaging / offline UI

Distro builds often have **no network** during `%build`. calfNXT keeps `ui/dist`
out of git and publishes a **prebuilt UI tarball** on each GitHub Release instead.

1. **Source0** — sources for tag `vX.Y.Z` (e.g. `calfnxt-X.Y.Z.tar.gz` from the release, or a git archive).
2. **Source1** — `calfnxt-X.Y.Z-ui-dist.tar.xz` (+ checksum from the matching `.sha256` asset).
3. In `%prep`, unpack Source1 at the **source tree root** so `ui/dist/` (including `.stamp`) appears.
4. Configure with prebuilt UI (no Node/npm required for the SPA):

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCALFNXT_USE_PREBUILT_UI=ON
cmake --build build --target calfnxt-plugins -j
# system-wide (packaging): DESTDIR + prefix — default libdir/vst3 (e.g. /usr/lib/vst3)
DESTDIR=/tmp/pkgroot cmake --install build --prefix /usr
# optional override: -DCALFNXT_VST3_INSTALL_DIR=lib64/vst3
```

Developer / local install still defaults to `~/.vst3`. Override the destination:

```bash
./tools/install-user-vst3.sh /usr/lib/vst3
# or: CALFNXT_VST3_DIR=/usr/lib/vst3 cmake --build build --target install-user-vst3-copy
```

Fetching Source0/Source1 (with checksums) before the build is normal and allowed;
what must stay offline is `npm install` / registry access during compile.
The VST3 SDK remains a separate dependency (`external/vst3sdk` or a distro package).

Upstream release helper (bumps version, tags, builds the ui-dist asset, pushes,
creates the GitHub Release):

```bash
./tools/release.sh          # prints current version, then asks for the new one
./tools/release.sh minor    # or patch / major / X.Y.Z
```

See [`VERSIONING.md`](VERSIONING.md) for when to bump patch vs minor vs major.

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
| Delay     | `~/.vst3/calfNXTDelay.vst3`     |
| Reverb    | `~/.vst3/calfNXTReverb.vst3`    |

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

`calfnxt-plugins` builds **every** plugin (Equalizer, Stereo, Transients, Compressor, DeEsser, Delay, Reverb, …) and embeds each
UI pack. `install-user-vst3` then copies the bundles into `~/.vst3/`:

| Plugin    | Path                         |
|-----------|------------------------------|
| Equalizer | `~/.vst3/calfNXTEqualizer.vst3` |
| Stereo    | `~/.vst3/calfNXTStereo.vst3`    |
| Transients | `~/.vst3/calfNXTTransients.vst3` |
| Compressor | `~/.vst3/calfNXTCompressor.vst3` |
| DeEsser   | `~/.vst3/calfNXTDeesser.vst3`   |
| Delay     | `~/.vst3/calfNXTDelay.vst3`     |
| Reverb    | `~/.vst3/calfNXTReverb.vst3`    |

Rescan / reload the plugins in the host after install.

### UI-only changes (React / SCSS / widgets)

A Vite build **alone** does **not** update what the VST editor shows.  
You must copy the SPA into each bundle’s `Resources/`:

```bash
./tools/install-user-vst3.sh
# or manually:
cmake --build build --target calfnxt-equalizer-resources calfnxt-stereo-resources calfnxt-transients-resources calfnxt-compressor-resources calfnxt-deesser-resources calfnxt-delay-resources -j
cmake --build build --target install-user-vst3
```

The `*-resources` targets run `npm run build` in `ui/` (one Vite build per plugin →
`ui/dist/plugins/<id>/`) and embed only that plugin’s assets.

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

Open e.g. http://localhost:5173/#equalizer · `#stereo` · `#transients` · `#compressor` · `#deesser` · `#delay` · `#reverb`

This is useful for layout and widget work. It does **not** replace installing into `~/.vst3` for Carla / other hosts.

### Website screenshots (optional Studio)

Refresh `website/images/*.png` with static demo data (Playwright). Install only if
you need it — see [`studio/README.md`](studio/README.md).

```bash
cd studio && npm install    # once (downloads Chromium)
npm run studio              # from repo root — all plugins
npm run studio -- reverb    # one plugin
```

---

## Quick reference

| Goal                         | Command |
|-----------------------------|---------|
| Configure                   | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release` |
| Build **all** plugins (+ UI)| `cmake --build build --target calfnxt-plugins -j` |
| Embed SPA + install         | `./tools/install-user-vst3.sh` `[dest]` or `cmake --build build --target install-user-vst3` |
| System install (packaging)  | `cmake --install build --prefix /usr` (→ `$prefix/lib/vst3`) |
| Cut a GitHub release        | `./tools/release.sh` (see `VERSIONING.md`) |
| Single plugin (Equalizer)   | `cmake --build build --target calfnxt-equalizer calfnxt-equalizer-resources -j` |
| Single plugin (Stereo)      | `cmake --build build --target calfnxt-stereo calfnxt-stereo-resources -j` |
| Single plugin (Transients)  | `cmake --build build --target calfnxt-transients calfnxt-transients-resources -j` |
| Single plugin (Compressor)  | `cmake --build build --target calfnxt-compressor calfnxt-compressor-resources -j` |
| Single plugin (DeEsser)     | `cmake --build build --target calfnxt-deesser calfnxt-deesser-resources -j` |
| Single plugin (Delay)       | `cmake --build build --target calfnxt-delay calfnxt-delay-resources -j` |
| Single plugin (Reverb)      | `cmake --build build --target calfnxt-reverb calfnxt-reverb-resources -j` |
| UI HMR in the browser       | `cd ui && npm run dev` |
| Website UI screenshots      | `cd studio && npm i` then `npm run studio` (see `studio/README.md`) |

---

## Environment variables

Runtime / tooling knobs read from the process environment. Boolean-style flags
are **on** when the variable is set to any non-empty value (e.g. `1`).

### Editor / WebKit (`calfnxt-web-host`)

Set these in the **plugin host** environment (the helper inherits it via
`posix_spawn`). Example: `CALFNXT_WEB_DEBUG=1 carla …`.

| Variable | Values | Effect |
|----------|--------|--------|
| `CALFNXT_UI_SCALE` | float ≈ `0.05`…`8` | Forces editor scale instead of measuring CSS vs host pixels (HiDPI). Examples: `1`, `1.35`, `2`. Invalid / out-of-range → ignored. |
| `CALFNXT_WEB_DEBUG` | any non-empty | Extra logging to stderr; also enables WebKit developer extras and console→stdout. Diagnostics always append to `/tmp/calfnxt-ui.log`. |
| `CALFNXT_WEB_INSPECTOR` | any non-empty | Opens the WebKit Web Inspector on editor load (also enables developer extras). |
| `CALFNXT_WEB_NO_GPU` | any non-empty | WebKit hardware acceleration **off** (`NEVER`). Default without this flag is **on** (`ALWAYS`). Use if the embed paints blank/transparent on your GPU stack. |

Related (not calfNXT-owned, but often useful with WebKitGTK / X11 embed):

| Variable | Notes |
|----------|--------|
| `GDK_BACKEND=x11` | Force X11 for the helper when the session is Wayland-only. |
| `WEBKIT_DISABLE_DMABUF_RENDERER` | WebKitGTK blank-window workaround on some drivers; set yourself if needed. |
| `WEBKIT_DISABLE_COMPOSITING_MODE` | Last-resort WebKit compositing disable; not set by calfNXT. |
| `DISPLAY` | Required for the X11 `GtkPlug` embed. |

### Install / packaging helpers

| Variable | Values | Effect |
|----------|--------|--------|
| `CALFNXT_VST3_DIR` | absolute path | Destination for `install-user-vst3-copy` / `./tools/install-user-vst3.sh` (default `~/.vst3`). Example: `CALFNXT_VST3_DIR=/usr/lib/vst3 ./tools/install-user-vst3.sh`. |
| `BUILD_DIR` | path | Override build tree for `./tools/install-user-vst3.sh` (default `<repo>/build`). |
| `JOBS` | integer | Parallelism for that script’s `cmake --build` (default `nproc`). |

### CMake options (not environment variables)

Configure-time `-D` flags, documented here so they are not confused with `getenv`:

| Option | Effect |
|--------|--------|
| `CALFNXT_USE_PREBUILT_UI=ON` | Use committed/unpacked `ui/dist` (needs `.stamp`); no `npm` during build. |
| `CALFNXT_VST3_INSTALL_DIR` | Relative path under prefix for `cmake --install` (default `${CMAKE_INSTALL_LIBDIR}/vst3`). |
| `CALFNXT_USER_VST3_DIR` | Cache default for user-copy install when `CALFNXT_VST3_DIR` env is unset. |

---

## Notes

- Codegen runs as part of the CMake plugin targets (`dsp/<id>/<id>.plugin.json` → C++ params + `ui/src/generated/`).
- Environment variables: see [Environment variables](#environment-variables) above.
- The editor UI runs **out-of-process** (`calfnxt-web-host` next to the `.so`) so Ardour does not load GTK3 into its process. Embed is still X11 `GtkPlug`; Wayland-only sessions may need `GDK_BACKEND=x11` for the host/helper.
