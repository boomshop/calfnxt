#!/usr/bin/env bash
# Force-rebuild SPA → embed into build VST3 Resources → install ~/.vst3.
#
# Do this in the shell (not nested cmake --build from a CMake target): stamp
# clearing + npm must run in the outer build, and ~/.vst3 must be writable
# (close the plugin host if install fails with "Permission denied").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${BUILD_DIR:-$ROOT/build}"
JOBS="${JOBS:-$(nproc)}"
UI_STAMP="$ROOT/ui/dist/.stamp"

if [[ ! -d "$BUILD" ]]; then
  echo "error: build dir missing: $BUILD" >&2
  echo "  configure first: cmake -S \"$ROOT\" -B \"$BUILD\" -DCMAKE_BUILD_TYPE=Release" >&2
  exit 1
fi

echo "==> clear UI / Resources stamps"
rm -f "$UI_STAMP"
rm -f "$BUILD"/calfnxt-*.resources.stamp

echo "==> rebuild SPA (calfnxt_web_ui) (-j$JOBS)"
cmake --build "$BUILD" --target calfnxt_web_ui -j"$JOBS"

echo "==> embed Resources + refresh web-host (-j$JOBS)"
cmake --build "$BUILD" --target \
  calfnxt-equalizer-resources \
  calfnxt-stereo-resources \
  calfnxt-transients-resources \
  calfnxt-compressor-resources \
  calfnxt-web-host-bundles \
  -j"$JOBS"

echo "==> install → ~/.vst3 (close Carla/Ardour if Permission denied)"
cmake --build "$BUILD" --target install-user-vst3-copy -j"$JOBS"

echo "==> done (reload plugins in host)"
ls -la "$HOME"/.vst3/calfNXTEqualizer.vst3/Contents/Resources/assets/equalizer*.js 2>/dev/null || true
