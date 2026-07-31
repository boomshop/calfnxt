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
RES_LIST="$BUILD/calfnxt-install-resources.txt"

if [[ ! -d "$BUILD" ]]; then
  echo "error: build dir missing: $BUILD" >&2
  echo "  configure first: cmake -S \"$ROOT\" -B \"$BUILD\" -DCMAKE_BUILD_TYPE=Release" >&2
  exit 1
fi

if [[ ! -f "$RES_LIST" ]]; then
  echo "error: missing $RES_LIST — reconfigure cmake first" >&2
  echo "  cmake -S \"$ROOT\" -B \"$BUILD\"" >&2
  exit 1
fi

mapfile -t RES_TARGETS < <(grep -v '^[[:space:]]*$' "$RES_LIST" || true)
if [[ ${#RES_TARGETS[@]} -eq 0 ]]; then
  echo "error: no install resource targets in $RES_LIST" >&2
  exit 1
fi

echo "==> clear UI / Resources stamps"
rm -f "$UI_STAMP"
rm -f "$BUILD"/calfnxt-*.resources.stamp

echo "==> rebuild SPA (calfnxt_web_ui) (-j$JOBS)"
cmake --build "$BUILD" --target calfnxt_web_ui -j"$JOBS"

echo "==> embed Resources + refresh web-host (-j$JOBS)"
cmake --build "$BUILD" --target "${RES_TARGETS[@]}" calfnxt-web-host-bundles -j"$JOBS"

echo "==> install → ~/.vst3 (close Carla/Ardour if Permission denied)"
cmake --build "$BUILD" --target install-user-vst3-copy -j"$JOBS"

echo "==> done (reload plugins in host)"
ls -la "$HOME"/.vst3/calfNXT*.vst3/Contents/Resources/assets/*.{js,css} 2>/dev/null \
  | grep -E 'equalizer|stereo|transients|compressor|deesser' || true
