# calfNXT

<p align="center">
  <img src="calfNXT.svg" alt="calfNXT" width="320" />
</p>

**calfNXT** is the successor to [Calf Studio Gear](https://calf-studio-gear.org):
a **VST3** plugin suite with a React + AUX web UI (**Linux + X11**). WebKitGTK
runs in a separate helper process so the plugin `.so` stays free of GTK —
required for hosts like Ardour. The default helper is **`calfnxt-web-host`**
(GTK 3 `GtkPlug` / XEmbed). An optional floating **`calfnxt-web-host-gtk4`**
avoids XEmbed entirely ([Floating GTK4 helper](#floating-gtk4-helper)). Classic
Calf DSP heritage is reused where it fits, substantially reworked for this stack.

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

## 2.0.0 — breaking rename (trademark)

**This major bump exists for trademark reasons, not because the DSP changed.**

The pitch-pedal plugin is now **Bender** (`calfNXTBender.vst3`, `#bender`). The
previous plugin identity — bundle name, VST3 UID, and plugin id — is
**discontinued**. We will not keep shipping a third-party trademark.

Hosts will **not** map old sessions, presets, or automations onto Bender. That
incompatibility is intentional. Replace the insert with Bender and remove the
old `.vst3` from your plugin folder.

---

## Plugins

Install paths are always `~/.vst3/<Bundle>` (or `$CALFNXT_VST3_DIR` /
`cmake --install` — see [Build and install](#build-and-install)). Every effect
shares **In/Out gain + peak meters** in the header (not repeated below).

### Dynamics

| Plugin                   | Bundle                   | Description                                  |
| ------------------------ | ------------------------ | -------------------------------------------- |
| **Compressor**           | `calfNXTCompressor.vst3` | Feed-forward compressor                      |
| **Expander**             | `calfNXTExpander.vst3`   | Downward expander / gate                     |
| **Multiband Compressor** | `calfNXTMbcomp.vst3`     | 2–6 band Linkwitz–Riley compressor           |
| **Limiter**              | `calfNXTLimiter.vst3`    | Lookahead brickwall limiter                  |
| **Multiband Limiter**    | `calfNXTMblimiter.vst3`  | 2–6 band lookahead limiter + broadband stage |
| **DeEsser**              | `calfNXTDeesser.vst3`    | Sibilance / rumble dynamics                  |
| **Transients**           | `calfNXTTransients.vst3` | Attack / sustain envelope shaper             |
| **Tamer**                | `calfNXTTamer.vst3`      | Spectral resonance suppressor (STFT)         |

### EQ & filter

| Plugin        | Bundle                  | Description                                    |
| ------------- | ----------------------- | ---------------------------------------------- |
| **Equalizer** | `calfNXTEqualizer.vst3` | 16-band parametric EQ with optional dynamic EQ |
| **Filter**    | `calfNXTFilter.vst3`    | Multimode LP / HP / BP / BR / allpass          |

### Harmonics

| Plugin        | Bundle                  | Description                         |
| ------------- | ----------------------- | ----------------------------------- |
| **Harmonics** | `calfNXTHarmonics.vst3` | Saturator / exciter / bass enhancer |
| **Crusher**   | `calfNXTCrusher.vst3`   | Bit crusher                         |

### Delay & reverb

| Plugin      | Bundle                | Description                           |
| ----------- | --------------------- | ------------------------------------- |
| **Delay**   | `calfNXTDelay.vst3`   | Stereo / ping-pong / sequential delay |
| **Reverb**  | `calfNXTReverb.vst3`  | Algorithmic early + late reverb       |
| **Impulse** | `calfNXTImpulse.vst3` | Convolution reverb                    |

### Modulators

| Plugin             | Bundle                      | Description                       |
| ------------------ | --------------------------- | --------------------------------- |
| **Ring Modulator** | `calfNXTRingmodulator.vst3` | Stereo ring modulator             |
| **Pulsator**       | `calfNXTPulsator.vst3`      | Stereo tremolo / autopanner       |
| **Phaser**         | `calfNXTPhaser.vst3`        | Stereo allpass phaser             |
| **Flanger**        | `calfNXTFlanger.vst3`       | Stereo delay flanger              |
| **Chorus**         | `calfNXTChorus.vst3`        | Multi-tap chorus (up to 8 voices) |

### Tools

| Plugin       | Bundle                 | Description                                       |
| ------------ | ---------------------- | ------------------------------------------------- |
| **Analyzer** | `calfNXTAnalyzer.vst3` | Spectrum, difference, waterfall, loudness, goniometer (passthrough) |
| **Stereo**   | `calfNXTStereo.vst3`   | Width / M/S imaging                               |
| **Split**    | `calfNXTSplit.vst3`    | Mono in → stereo out                              |

### Pitch

| Plugin      | Bundle                | Description                                                                                    |
| ----------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| **Tuner**   | `calfNXTTuner.vst3`   | Realtime monophonic pitch correction                                                           |
| **Octaver** | `calfNXTOctaver.vst3` | Monophonic octave stack (−2 / −1 / +1 + sub)                                                   |
| **Bender**  | `calfNXTBender.vst3`  | Delay-line pitch pedal (±24 st). **2.0.0:** new identity (trademark); old sessions do not load |

Site and per-plugin descriptors: [calfnxt.org](https://calfnxt.org/),
`dsp/<id>/<id>.plugin.json`.

---

## Dependencies

Target: **Linux + X11** (the editor forces the GDK X11 backend for host embedding).

### Tools

| Tool                     | Role                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CMake** ≥ 3.25         | Build                                                                                                                                                             |
| **GCC or Clang** (C++17) | Compile                                                                                                                                                           |
| **pkg-config**           | Find GTK / WebKit                                                                                                                                                 |
| **Python 3**             | Parameter codegen                                                                                                                                                 |
| **Node.js** + **npm**    | Only to **rebuild** the React SPA from `ui/src`. Not needed to run or to compile plugins if you unpack the release ui-dist tarball (`CALFNXT_USE_PREBUILT_UI=ON`) |

Optional: **Ninja**.

### System libraries (pkg-config)

| Module           | Purpose                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gtk+-3.0`       | GtkPlug / X11 embed (**only** `calfnxt-web-host`, never the `.so`)                                                        |
| `webkit2gtk-4.1` | WebKitGTK **for GTK 3** in the default helper (`2` = WebKit2 engine, **not** GTK 2)                                      |
| `gtk4` + `webkitgtk-6.0` | Optional floating helper `calfnxt-web-host-gtk4` (`CALFNXT_WEB_HOST=gtk4`). Same SPA / ui-dist; not a drop-in for the embed host. |

Usually pulled in as deps: GLib, GObject, Cairo, Soup, X11.

**Arch / CachyOS:**

```bash
sudo pacman -S --needed base-devel cmake ninja pkgconf python nodejs npm gtk3 webkit2gtk-4.1
# optional floating helper:
sudo pacman -S --needed gtk4 webkitgtk-6.0
```

**Debian / Ubuntu:**

```bash
sudo apt install --no-install-recommends \
  build-essential cmake ninja-build pkg-config python3 nodejs npm \
  libgtk-3-dev libwebkit2gtk-4.1-dev
# optional floating helper:
sudo apt install --no-install-recommends libgtk-4-dev libwebkitgtk-6.0-dev
```

Host for testing (e.g. **Carla**, Ardour) is not required to compile.
Omit `nodejs` / `npm` if you unpack the [prebuilt UI tarball](#packaging--offline-ui).

### Steinberg VST3 SDK

Lives at `external/vst3sdk/` (often not in this git tree). If missing:

```bash
git clone --recursive https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk
# Optional pin, e.g. v3.8.0_build_66 + submodule update --init --recursive
```

VSTGUI is disabled (`SMTG_ENABLE_VSTGUI_SUPPORT=OFF`).

### npm (UI)

**Runtime and C++ build:** none, if `ui/dist` comes from the GitHub **ui-dist**
tarball (`-DCALFNXT_USE_PREBUILT_UI=ON`). See
[npm is not required to run or build](#npm-is-not-required-to-run-or-build).

**Rebuild the SPA from TypeScript** (UI source changes, HMR, a new ui-dist):
CMake runs `npm ci` in `ui/` when `node_modules` is missing, otherwise
`npm run build` only (lockfile, not a shopping list). Manual: `cd ui && npm ci`.
Stack: React, Vite, TypeScript, Sass, `@deutschesoft/aux-widgets`, `awml`,
`use-aux-widgets`.

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

| Goal                            | Command                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| All plugins + embed + `~/.vst3` | `./tools/install-user-vst3.sh`                                                                      |
| One plugin (fast iterate)       | `./tools/install-user-vst3.sh mbcomp`                                                               |
| Custom dest                     | `./tools/install-user-vst3.sh --dest /usr/lib/vst3 mbcomp`                                          |
| UI pack only (no install)       | `cd ui && npm run build -- mbcomp` (omit id = all)                                                  |
| DSP/C++ only, then install      | `cmake --build build --target calfnxt-plugins -j` then `install-user-vst3` / the script             |
| System install (packaging)      | `cmake --install build --prefix /usr` → `$prefix/lib/vst3`                                          |
| Single cmake targets            | `cmake --build build --target calfnxt-<id> calfnxt-<id>-resources -j` then `install-user-vst3-copy` |

A Vite build **alone** does not update the VST editor — Resources must be
re-embedded (the install script does that). Plugin ids for the script / Vite:
`equalizer` `stereo` `transients` `compressor` `expander` `deesser` `delay`
`reverb` `mbcomp` `limiter` `mblimiter` `harmonics` `analyzer` `filter`
`ringmod` `pulsator` `crusher` `phaser` `flanger` `chorus` `split` `tuner`
`octaver` `bender` `impulse` `tamer`.

Codegen is part of the CMake plugin targets (`dsp/<id>/<id>.plugin.json` → C++
params + `ui/src/generated/`).

### Browser HMR (not the VST embed)

```bash
cd ui && npm install   # once
cd ui && npm run dev   # e.g. http://localhost:5173/#chorus
```

Useful for layout/widgets; does **not** replace `~/.vst3` for hosts.

### Website screenshots / publish (optional)

```bash
cd studio && npm install    # once (Chromium)
./tools/website.sh shots              # screenshots only (alias: studio)
./tools/website.sh publish            # upload full website/ (incl. images)
./tools/website.sh all                # screenshots, then upload everything (alias: full)
./tools/website.sh site               # upload index.html + styles.css only (alias: website)
# ./tools/website.sh studio -- reverb night calfnxt
# npm run studio                      # same capture as `shots`
```

See [`studio/README.md`](studio/README.md).

---

## Environment variables

Boolean-style flags are **on** when set to any non-empty value (e.g. `1`).
Editor / WebKit vars must be in the **plugin host** environment (`calfnxt-web-host`
inherits them via `posix_spawn`). The helper’s spawn `envp` omits
`LD_LIBRARY_PATH`; the **host process environment is not modified** — see
[Clarifications](#clarifications) and
[Editor black in Mixbus](#editor-black-in-mixbus-helper-exit-127).
Example: `CALFNXT_WEB_DEBUG=1 carla …`.

### Editor / WebKit (`calfnxt-web-host`)

| Variable                   | Values             | Effect                                                                                                                                                                         |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CALFNXT_UI_SCALE`         | float ≈ `0.05`…`8` | Force editor scale (HiDPI) instead of measuring CSS vs host pixels. Invalid → ignored.                                                                                         |
| `CALFNXT_WEB_DEBUG`        | non-empty          | Extra stderr logging; WebKit developer extras + console→stdout. File log is always `/tmp/calfnxt-ui.log` (capped at 512 KiB, then truncated).                                  |
| `CALFNXT_WEB_INSPECTOR`    | non-empty          | Open WebKit Inspector on editor load.                                                                                                                                          |
| `CALFNXT_WEB_NO_GPU`       | non-empty          | Hardware accel **off** (`NEVER`). Default is **on** (`ALWAYS`). Last-resort blank-window fix — usually **laggy**. Prefer DMA-BUF / GTK4 workarounds first ([Blank UI](#blank-or-black-editor-nvidia--dma-buf)). |
| `CALFNXT_WEB_HOST`         | `gtk4` / `float` / `wayland` | Opt-in **floating** helper `calfnxt-web-host-gtk4` (GTK 4 + `webkitgtk-6.0`, **no XEmbed**). Opens a separate window. See [Floating GTK4 helper](#floating-gtk4-helper). Alias: `CALFNXT_WEB_FLOATING=1`. |
| `CALFNXT_WEB_FLOATING`     | non-empty          | Same as `CALFNXT_WEB_HOST=gtk4`.                                                                                                                                               |
| `CALFNXT_XWAYLAND_NUDGE`   | non-empty          | Opt-in GNOME/Mutter + Ardour on Wayland workaround. **Off by default.** See [Editor black or frozen on GNOME/Wayland](#editor-black-or-frozen-on-gnomewayland).                |
| `CALFNXT_KEEP_HOST_LDPATH` | non-empty          | Copy the host `LD_LIBRARY_PATH` into the helper’s spawn `envp`. Default: omit it **for the child only** (Mixbus/Ardour bundled glib). Never touches the DAW’s own environment. |

Lean WebKit defaults (always on, not env-gated): `WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER`, media/WebRTC/WebAudio/page-cache off; HTML5 **localStorage** stays on for Header prefs (theme, viz Hz, Ardour tip dismiss).

Related (not calfNXT-owned — set on the **plugin host** so the helper inherits them):

| Variable                          | Notes                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GDK_BACKEND=x11`                 | Force X11 for the helper on Wayland-only sessions.                                                                                    |
| `WEBKIT_DISABLE_DMABUF_RENDERER`  | Prefer this for blank UI on proprietary NVIDIA / some WebKit builds. Keeps acceleration when the stack allows; see [Blank UI](#blank-or-black-editor-nvidia--dma-buf). |
| `WEBKIT_DMABUF_RENDERER_FORCE_SHM`| Narrower DMA-BUF workaround on some WebKitGTK 2.52+ builds (shared-memory transport, hardware DMA-BUF off). Try if `DISABLE_DMABUF` feels too soft. |
| `WEBKIT_DISABLE_COMPOSITING_MODE` | Last-resort compositing disable; not set by calfNXT. Often worse than DMA-BUF-only.                                                   |
| `DISPLAY`                         | Required for the default X11 `GtkPlug` embed. Floating GTK4 may still use X11/XWayland depending on the session.                      |

### Install helpers

| Variable           | Effect                                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| `CALFNXT_VST3_DIR` | Dest for user install (default `~/.vst3`).                              |
| `BUILD_DIR`        | Build tree for `./tools/install-user-vst3.sh` (default `<repo>/build`). |
| `JOBS`             | Parallelism for that script (default `nproc`).                          |

### CMake options (`-D`, not `getenv`)

| Option                       | Effect                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `CALFNXT_USE_PREBUILT_UI=ON` | Use unpacked `ui/dist` (needs `.stamp`); no `npm` during build.                   |
| `CALFNXT_VST3_INSTALL_DIR`   | Path under prefix for `cmake --install` (default `${CMAKE_INSTALL_LIBDIR}/vst3`). |
| `CALFNXT_USER_VST3_DIR`      | Cache default for user-copy when `CALFNXT_VST3_DIR` is unset.                     |

---

## Clarifications

A few recurring claims recycle the **classic Calf** story (GTK 2 loaded into the
plugin process), misread package names, or confuse a build tool with what
users install. calfNXT is a different architecture.

Code-level map: [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Not in-process GTK

Classic Calf Studio Gear linked **GTK 2 into the plugin `.so`**. Hosts that ship
their own toolkit (official Ardour / Mixbus binaries) then collide on GType /
ABI and abort. **calfNXT does not do that.** The VST3 `.so` is DSP plus a thin
editor proxy. GTK 3 and WebKitGTK live in a separate helper process.

```
DAW process                            helper process (default)
───────────                            ───────────────────────
calfNXT*.so                            calfnxt-web-host
  DSP (no GUI toolkit)                   GTK 3 GtkPlug
  WebEditor (VST3 IPlugView proxy)       WebKitGTK (webkit2gtk-4.1)
  posix_spawn + Unix socketpair          XEmbed into the host X11 window

Optional: CALFNXT_WEB_HOST=gtk4 → calfnxt-web-host-gtk4 (GTK 4 + webkitgtk-6.0,
floating window, no XEmbed). Same socket bridge / SPA. See below.
```

- **`ldd` on the plugin `.so` must not list `libgtk-3` or `libwebkit`.** Only
  the helpers link those (`common/ui/CMakeLists.txt`). CMake
  `pkg_check_modules` for GTK/WebKit is there, not on the plugin targets.
- Each bundle ships `Contents/<arch>/calfnxt-web-host` (and
  `calfnxt-web-host-gtk4` when built) next to the `.so`.
- Default Linux VST3 editors are **X11** embeds. On a Wayland session that path
  runs under XWayland (see [GNOME/Wayland](#editor-black-or-frozen-on-gnomewayland)).
  The floating GTK4 helper skips the embed socket entirely.

Official Ardour binaries can load the `.so` because it does not pull system
GTK into Ardour. The custom editor is the helper using system WebKitGTK.

```bash
ldd ~/.vst3/calfNXTEqualizer.vst3/Contents/x86_64-linux/calfNXTEqualizer.so \
  | grep -E 'libgtk|libwebkit' || echo 'ok: no GTK/WebKit in the plugin'
```

### GTK is not the plugin UI

Knobs, meters, and layout are **React in WebKit**, not GTK widgets. GTK is only
the XEmbed shell: WebKitGTK is a `GtkWidget`, and `GtkPlug` is how that widget
is embedded into the host’s X11 editor window. The widget tree we create is one
`GtkPlug`, one `WebKitWebView` inside it, and Impulse’s folder picker. The
actual GTK in `common/ui/web_host_main.cpp` is this shape:

```cpp
gdk_set_allowed_backends("x11");
gtk_init_check(&argc, &argv);

g.plug = gtk_plug_new(parentXid);
gtk_container_add(GTK_CONTAINER(g.plug), GTK_WIDGET(g.webview));
gtk_widget_show_all(g.plug);

gtk_main();
```

The helper is ~1200 lines mostly socket bridge, URI scheme, WebKit settings, and
X11/XWayland workarounds — not a GTK control surface. The plugin `.so` links
none of it.

### `webkit2gtk-4.1` is GTK 3, not GTK 2

The pkg-config name is easy to misread. The **`2` is WebKit2** (WebKit’s
multiprocess engine), **not GTK 2**. This repo has never linked GTK 2.

| Token in `webkit2gtk-4.1` | Means                                                |
| ------------------------- | ---------------------------------------------------- |
| **WebKit2**               | Multiprocess WebKit API (the `2` in the module name) |
| **GTK 3**                 | Toolkit module `gtk+-3.0`                            |
| **4.1**                   | WebKitGTK API series for GTK 3 + libsoup 3           |

GTK 4 WebKit is a different module (`webkitgtk-6.0`). Distro names such as
`webkit2gtk`, `webkitgtk`, or “webkit 3/4” do not mean GTK 2 vs GTK 3 vs GTK 4.
If a rolling distro dropped the `webkit2gtk-4.1` development package, that is
packaging — not evidence that this UI is GTK 2.

### Mixbus and Ardour LD_LIBRARY_PATH (child only)

Harrison Mixbus and some Ardour packages prepend `$INSTALL_DIR/lib` to
`LD_LIBRARY_PATH` so the DAW finds bundled glib/GTK. The helper is a
**system** WebKitGTK binary. If it inherited that path, the linker would load
Mixbus’s older `libglib-2.0.so` first; system `libatspi` then fails
(`undefined symbol: g_once_init_leave_pointer`) → helper **exit 127**, black
editor, audio still runs.

**What we do:** `posix_spawn` receives a copied environment with
`LD_LIBRARY_PATH` omitted (`buildWebHostEnviron` in `common/ui/web_editor.cpp`).
That copy is the helper’s `envp` only.

**What we do not do:** we never `unsetenv` / `setenv` / `putenv`
`LD_LIBRARY_PATH` in the DAW process. The host `environ` is unchanged. Later
`dlopen` of control surfaces and other modules still sees Ardour’s original
path.

Opt out (helper inherits the host path; Mixbus editor typically dies again):
`CALFNXT_KEEP_HOST_LDPATH=1`. Logs:
[Editor black in Mixbus](#editor-black-in-mixbus-helper-exit-127).

### npm is not required to run or build

The editor hosts load is **static HTML / JS / CSS** inside each `.vst3`
`Resources/`. `calfnxt-web-host` (WebKitGTK) serves that. **Node.js and npm are
not runtime dependencies**, and they are **not required to compile** the
plugins either.

Each GitHub Release ships a **prebuilt UI tarball** (`calfnxt-*-ui-dist.tar.xz`).
Unpack it at the source tree root (`ui/dist/` including `.stamp`) and configure
`-DCALFNXT_USE_PREBUILT_UI=ON`. CMake never calls npm; there is no registry
access. That is the path for distro packages and for anyone building the C++
from a tagged release. Details: [Packaging / offline UI](#packaging--offline-ui).

npm is only a UI-source tool: changing React/TS, `npm run dev` (HMR), or
cutting a new ui-dist (`./tools/release.sh`). Then CMake runs `npm ci` from
`ui/package-lock.json`.

---

## Floating GTK4 helper

Opt-in alternative to the default **GTK 3 `GtkPlug` / XEmbed** helper. Same
React SPA and JSON bridge; different process binary and windowing model.

```bash
CALFNXT_WEB_HOST=gtk4 carla          # or: float / wayland
# alias:
CALFNXT_WEB_FLOATING=1 ardour9
```

Needs `calfnxt-web-host-gtk4` built into the bundle (`gtk4` + `webkitgtk-6.0`
dev packages at compile time). If the gtk4 binary is missing, the editor falls
back to classic `calfnxt-web-host`.

### What you get

- **Separate floating window** — not painted inside the host’s plugin frame.
  The DAW may still open an empty embed chrome; the real UI is the helper
  window. Close that window to tear the UI down.
- **No XEmbed / `GtkPlug`.** Far fewer touch points with the host toolkit:
  the plugin `.so` still spawns the helper and talks over the socketpair, but
  the helper does not plug into the host X11 socket. That avoids the worst
  XEmbed failure modes (host freeze if the plug process dies while still
  embedded; GNOME/Wayland “black until resize” present bugs on the embed path).
- **Cleaner lifecycle:** hide/close → helper **exits**; reopen → WebEditor
  respawns. No long-lived “parked” WebKit process for that path.
- Often a practical escape hatch when the **embedded** WebKitGTK surface stays
  blank on proprietary NVIDIA / DMA-BUF stacks (see next section).

### Trade-offs

- Not a drop-in for hosts that insist on a single embedded editor rectangle.
- Still WebKit: GPU/DMA-BUF quirks can appear on `webkitgtk-6.0` too — try the
  same WebKit env vars if needed.
- Default remains the GtkPlug helper for Carla/Reaper/Ardour embed workflows.

---

## Blank or black editor (NVIDIA / DMA-BUF)

Different from the GNOME/Wayland “black until resize” case below: here the
page **finishes loading** and the embed is mapped, but the surface stays
black/blank because WebKit’s **DMA-BUF / GBM** path fails.

Typical log line in `/tmp/calfnxt-ui.log` (or helper stderr):

```text
Failed to create GBM buffer of size …: Invalid argument
```

Seen especially with **proprietary NVIDIA** drivers and some WebKitGTK
releases (GTK 3 embed path). calfNXT issue:
[boomshop/calfnxt#11](https://github.com/boomshop/calfnxt/issues/11). Upstream
context includes [WebKit #259644](https://bugs.webkit.org/show_bug.cgi?id=259644)
(blank screen on NVIDIA), [WebKit #262607](https://bugs.webkit.org/show_bug.cgi?id=262607)
(DMA-BUF + NVIDIA), and related DMA-BUF / X11 notes such as
[WebKit #280210](https://bugs.webkit.org/show_bug.cgi?id=280210).

### Workarounds (try in order)

Set these on the **plugin host** process (helper inherits them). Confirm in
`/tmp/calfnxt-ui.log` that the flag arrived (`gfx dmabuf=…` / `no_gpu=…`).

1. **`WEBKIT_DISABLE_DMABUF_RENDERER=1`** — preferred first try. Disables the
   broken DMA-BUF transport; keeps hardware acceleration when the stack still
   allows it. Example: `WEBKIT_DISABLE_DMABUF_RENDERER=1 reaper`
2. **`WEBKIT_DMABUF_RENDERER_FORCE_SHM=1`** — on some WebKitGTK 2.52+ builds a
   narrower knob (shared-memory transport, hardware DMA-BUF off). Try if (1)
   is unavailable or still soft.
3. **`CALFNXT_WEB_HOST=gtk4`** — floating GTK4 helper ([above](#floating-gtk4-helper)).
   Avoids the GtkPlug embed path entirely; often paints when the embed does not.
4. **`CALFNXT_WEB_NO_GPU=1`** — forces WebKit hardware acceleration **off**
   (`NEVER`). Usually **fixes paint but feels laggy** (software path). Last
   resort, not the default recommendation.

Do **not** set `CALFNXT_WEB_NO_GPU` globally “just in case” — it costs UI
smoothness on every host that already accelerates fine. The GNOME/Wayland
present bug is a **different** failure mode; DMA-BUF off does not fix “only
updates on resize.”

---

## Ardour: closing the plugin UI leaves RAM in use

**If you use Ardour and wonder why `calfnxt-web-host` sticks around after you
close the plugin window — read this.**

VST3 has `IPlugView::attached` / `removed`. Many hosts (Carla, Reaper) call
`removed()` when the editor closes; calfNXT then shuts down the helper and
reaps the process.

**Ardour’s default is different:** closing a plugin GUI window only **hides**
it. The view stays alive so reopen is fast. For calfNXT’s GTK 3 XEmbed helper
that means the out-of-process WebKit stack can remain parked (often on the
order of **hundreds of MB RSS per open UI**) until the plugin is removed from
the track or Ardour destroys the GUI instance.

Inside Ardour (English UI strings):

1. **Edit** → **Preferences**
2. **Plugins** → **GUI**
3. Find **Closing a Plugin GUI Window**
4. Choose **only destroys VST2/3 UIs, hides others**  
   (or **destroys the GUI instance, releasing resources**)
5. Close and reopen the plugin UI — the helper should exit on window close.

With that preference, Ardour calls `removed()` on close and our normal
teardown runs (same idea as Carla/Reaper).

If you leave the default (“only hides the window”), calfNXT **deep-parks**
safely (destroys the WebView/context, keeps the `GtkPlug` — killing the plug
while Ardour still owns the XEmbed socket can freeze the DAW). That avoids a
crash but does **not** fully free the helper process RSS. The floating GTK4
helper is another escape hatch (separate window; exits on close).

In the plugin header, Ardour + GTK 3 embed shows an orange warning control with
the same steps. **Don’t show again** stores a dismiss flag in the editor
`localStorage` (`calfnxt.ardourGuiTip.dismissed`). Clear it from the WebKit
Inspector (`CALFNXT_WEB_INSPECTOR=1`) if you need the tip back.

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

Hosts hand an **X11 embed window ID**. GTK/WebKit stay out of the `.so`
([Clarifications](#clarifications)); **`calfnxt-web-host`** does GtkPlug +
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

---

## Editor black in Mixbus (helper exit 127)

Symptom of the Mixbus/Ardour launcher putting bundled glib on `LD_LIBRARY_PATH`
while the helper needs **system** WebKitGTK. Background and why this does **not**
break Ardour control surfaces:
[Mixbus and Ardour LD_LIBRARY_PATH](#mixbus-and-ardour-ld_library_path-child-only).

Vanilla Ardour often works on the same machine (newer bundled glib, or no
`LD_LIBRARY_PATH` override). `ldd` on the helper looks fine; the clash is
runtime under Mixbus.

Confirm in `/tmp/calfnxt-ui.log`:

```text
[calfnxt] helper env: LD_LIBRARY_PATH + GTK_PATH cleared for web-host
[calfnxt] spawned web-host pid=…
```

without a following `exited immediately`. Ardour’s launcher also sets `GTK_PATH` to
its GTK2 tree; the helper is GTK3+WebKit and must not inherit that (otherwise
`gtk_init_check` fails and the editor stays empty). Opt out of LD stripping only:
`CALFNXT_KEEP_HOST_LDPATH=1` (GTK_PATH is still cleared; Mixbus may still fail on
bundled glib).
