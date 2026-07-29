# calfNXT

<p align="center">
  <img src="calfNXT.svg" alt="calfNXT" width="320" />
</p>

**calfNXT** is the successor to [Calf Studio Gear](https://calf-studio-gear.org):
a greenfield **VST3** plugin suite with a new embedded web UI (React + AUX /
WebKitGTK, Linux first). Parts of the classic Calf DSP are reused but
substantially reworked; the UI and host integration are new, with additional
features and the goal of bringing over most of the original signal processors
over time.

Branding / namespace: **calfNXT**. Shared React SPA UI, packed per plugin into
each `.vst3` bundle’s `Resources/`.

**Early public preview (Linux + X11 hosts):** shipping today are **Equalizer**
(`calfNXTEqualizer`), **Stereo** (`calfNXTStereo`) and **Transients** (`calfNXTTransients`) — more processors from
the classic Calf suite will follow as work continues.

This project is free software licensed under the **GNU General Public License
v3 or later** — see [`LICENSE`](LICENSE) and [`COPYRIGHT`](COPYRIGHT).

For architecture and agent handoff, see [`ARCHITECTURE.md`](ARCHITECTURE.md)
and [`AGENTS.md`](AGENTS.md).

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
| `gtk+-3.0` | GtkPlug / X11 embed shell |
| `webkit2gtk-4.1` | WebKitGTK editor (`WebKitWebView`) |

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

`calfnxt-plugins` builds **every** plugin (Equalizer, Stereo, Transients, …) and embeds each
UI pack. `install-user-vst3` then copies the bundles into `~/.vst3/`:

| Plugin    | Path                         |
|-----------|------------------------------|
| Equalizer | `~/.vst3/calfNXTEqualizer.vst3` |
| Stereo    | `~/.vst3/calfNXTStereo.vst3`    |
| Transients | `~/.vst3/calfNXTTransients.vst3` |

Rescan / reload the plugins in the host after install.

### UI-only changes (React / SCSS / widgets)

A Vite build **alone** does **not** update what the VST editor shows.  
You must copy the SPA into each bundle’s `Resources/`:

```bash
./tools/install-user-vst3.sh
# or manually:
cmake --build build --target calfnxt-equalizer-resources calfnxt-stereo-resources calfnxt-transients-resources -j
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

Open e.g. http://localhost:5173/#equalizer or http://localhost:5173/#stereo or http://localhost:5173/#transients  

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
| UI HMR in the browser       | `cd ui && npm run dev` |

---

## Notes

- Codegen runs as part of the CMake plugin targets (`dsp/<id>/<id>.plugin.json` → C++ params + `ui/src/generated/`).
- Install also removes obsolete `calfNXTVolume.vst3` / `calfNXTBalance.vst3` / `calfNXTStereoTools.vst3` if still present from earlier builds.
- Env flags: `CALFNXT_WEB_DEBUG`, `CALFNXT_WEB_INSPECTOR`, `CALFNXT_UI_SCALE` (see `AGENTS.md`).
- The editor embeds via X11 (`GtkPlug`); Wayland-only sessions may need `GDK_BACKEND=x11` for the host.
