#!/usr/bin/env bash
# Force-rebuild SPA → embed into build VST3 Resources → install .vst3 bundles.
#
# Usage:
#   ./tools/install-user-vst3.sh                  # → ~/.vst3 (or CALFNXT_USER_VST3_DIR)
#   ./tools/install-user-vst3.sh /usr/lib/vst3    # system-wide (needs write access)
#   CALFNXT_VST3_DIR=/usr/lib/vst3 ./tools/install-user-vst3.sh
#
# For packaging, prefer cmake --install (DESTDIR/prefix) instead of this script:
#   cmake --install build --prefix /usr
#
# Stamp clearing + npm must run in this outer shell (not nested cmake --build).
# Close the plugin host if install fails with "Permission denied".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${BUILD_DIR:-$ROOT/build}"
JOBS="${JOBS:-$(nproc)}"
UI_STAMP="$ROOT/ui/dist/.stamp"
RES_LIST="$BUILD/calfnxt-install-resources.txt"

DEST=""
if [[ $# -ge 1 ]]; then
  case "$1" in
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      DEST="$1"
      shift
      ;;
  esac
fi
if [[ $# -gt 0 ]]; then
  echo "error: unexpected arguments: $*" >&2
  exit 1
fi

if [[ -n "$DEST" ]]; then
  export CALFNXT_VST3_DIR="$DEST"
fi
# Display dest hint (actual default may come from CMake cache if env unset).
SHOW_DEST="${CALFNXT_VST3_DIR:-${HOME}/.vst3}"

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

echo "==> install → $SHOW_DEST"
cmake --build "$BUILD" --target install-user-vst3-copy -j"$JOBS"

echo "==> done (reload plugins in host)"
ls -la "${SHOW_DEST}"/calfNXT*.vst3/Contents/Resources/assets/*.{js,css} 2>/dev/null \
  | grep -E 'equalizer|stereo|transients|compressor|deesser' || true
