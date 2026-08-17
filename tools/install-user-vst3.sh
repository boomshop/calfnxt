#!/usr/bin/env bash
# Force-rebuild SPA → embed into build VST3 Resources → install .vst3 bundles.
#
# Usage:
#   ./tools/install-user-vst3.sh                     # all plugins → ~/.vst3
#   ./tools/install-user-vst3.sh mbcomp              # one plugin (fast iterate)
#   ./tools/install-user-vst3.sh mbcomp compressor   # several
#   ./tools/install-user-vst3.sh --dest /usr/lib/vst3 mbcomp
#   ./tools/install-user-vst3.sh /usr/lib/vst3       # all → custom dest (path = dest)
#   CALFNXT_VST3_DIR=/usr/lib/vst3 ./tools/install-user-vst3.sh mbcomp
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
UI_DIR="$ROOT/ui"

# plugin_id → cmake target stem / VST3 package name (must match CMake).
declare -A PLUGIN_TARGET=(
  [equalizer]=calfnxt-equalizer
  [stereo]=calfnxt-stereo
  [transients]=calfnxt-transients
  [compressor]=calfnxt-compressor
  [expander]=calfnxt-expander
  [deesser]=calfnxt-deesser
  [delay]=calfnxt-delay
  [reverb]=calfnxt-reverb
  [mbcomp]=calfnxt-mbcomp
  [limiter]=calfnxt-limiter
  [mblimiter]=calfnxt-mblimiter
  [harmonics]=calfnxt-harmonics
  [analyzer]=calfnxt-analyzer
  [filter]=calfnxt-filter
  [ringmod]=calfnxt-ringmod
  [pulsator]=calfnxt-pulsator
)
declare -A PLUGIN_VST3=(
  [equalizer]=calfNXTEqualizer
  [stereo]=calfNXTStereo
  [transients]=calfNXTTransients
  [compressor]=calfNXTCompressor
  [expander]=calfNXTExpander
  [deesser]=calfNXTDeesser
  [delay]=calfNXTDelay
  [reverb]=calfNXTReverb
  [mbcomp]=calfNXTMbcomp
  [limiter]=calfNXTLimiter
  [mblimiter]=calfNXTMblimiter
  [harmonics]=calfNXTHarmonics
  [analyzer]=calfNXTAnalyzer
  [filter]=calfNXTFilter
  [ringmod]=calfNXTRingmodulator
  [pulsator]=calfNXTPulsator
)

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \?//'
  echo "Known plugins: ${!PLUGIN_TARGET[*]}"
}

DEST=""
PLUGIN_IDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dest)
      shift
      [[ $# -ge 1 ]] || { echo "error: --dest needs a path" >&2; exit 1; }
      DEST="$1"
      shift
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      # Bare absolute/relative path with no known plugin name → install dest.
      if [[ ${#PLUGIN_IDS[@]} -eq 0 && -z "$DEST" && ( "$1" == /* || "$1" == ./* || "$1" == ../* ) ]]; then
        DEST="$1"
      elif [[ -n "${PLUGIN_TARGET[$1]+x}" ]]; then
        PLUGIN_IDS+=("$1")
      else
        echo "error: unknown plugin or path: $1" >&2
        echo "  known: ${!PLUGIN_TARGET[*]}" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -n "$DEST" ]]; then
  export CALFNXT_VST3_DIR="$DEST"
fi
SHOW_DEST="${CALFNXT_VST3_DIR:-${HOME}/.vst3}"

if [[ ! -d "$BUILD" ]]; then
  echo "error: build dir missing: $BUILD" >&2
  echo "  configure first: cmake -S \"$ROOT\" -B \"$BUILD\" -DCMAKE_BUILD_TYPE=Release" >&2
  exit 1
fi

# Resolve which plugins to build (default: all from resources list / map).
if [[ ${#PLUGIN_IDS[@]} -eq 0 ]]; then
  PLUGIN_IDS=("${!PLUGIN_TARGET[@]}")
  # Stable order matching resources list when present.
  if [[ -f "$BUILD/calfnxt-install-resources.txt" ]]; then
    ORDERED=()
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      id="${line#calfnxt-}"
      id="${id%-resources}"
      if [[ -n "${PLUGIN_TARGET[$id]+x}" ]]; then
        ORDERED+=("$id")
      fi
    done < "$BUILD/calfnxt-install-resources.txt"
    if [[ ${#ORDERED[@]} -gt 0 ]]; then
      PLUGIN_IDS=("${ORDERED[@]}")
    fi
  fi
fi

SELECTIVE=0
if [[ ${#PLUGIN_IDS[@]} -lt ${#PLUGIN_TARGET[@]} ]]; then
  SELECTIVE=1
fi

echo "==> plugins: ${PLUGIN_IDS[*]}"
echo "==> install → $SHOW_DEST"

echo "==> clear Resources stamps (selected)"
for id in "${PLUGIN_IDS[@]}"; do
  rm -f "$BUILD/${PLUGIN_TARGET[$id]}.resources.stamp"
done
if [[ "$SELECTIVE" -eq 0 ]]; then
  rm -f "$UI_STAMP"
  rm -f "$BUILD"/calfnxt-*.resources.stamp
fi

echo "==> rebuild SPA pack(s) (-j UI sequential Vite)"
(
  cd "$UI_DIR"
  node scripts/build-plugins.mjs "${PLUGIN_IDS[@]}"
)

# Satisfy cmake calfnxt_web_ui dependency without rebuilding every pack again.
touch "$UI_STAMP"

CMAKE_TARGETS=()
VST3_NAMES=()
for id in "${PLUGIN_IDS[@]}"; do
  CMAKE_TARGETS+=("${PLUGIN_TARGET[$id]}" "${PLUGIN_TARGET[$id]}-resources")
  VST3_NAMES+=("${PLUGIN_VST3[$id]}")
done

echo "==> build + embed (-j$JOBS): ${CMAKE_TARGETS[*]}"
cmake --build "$BUILD" --target "${CMAKE_TARGETS[@]}" calfnxt-web-host -j"$JOBS"

# Refresh web-host next to bundles (shared helper; cheap if already built).
cmake --build "$BUILD" --target calfnxt-web-host-bundles -j"$JOBS"

echo "==> install → $SHOW_DEST"
mkdir -p "$SHOW_DEST"
CONFIG="${CMAKE_BUILD_TYPE:-Release}"
# SMTG multi-config layouts use build/VST3/<Config>/; single-config may omit it.
BUNDLE_ROOT=""
for cand in "$BUILD/VST3/$CONFIG" "$BUILD/VST3/Release" "$BUILD/VST3/Debug" "$BUILD/VST3"; do
  if [[ -d "$cand" ]]; then
    BUNDLE_ROOT="$cand"
    break
  fi
done
if [[ -z "$BUNDLE_ROOT" ]]; then
  echo "error: no VST3 output dir under $BUILD/VST3" >&2
  exit 1
fi

for name in "${VST3_NAMES[@]}"; do
  src="$BUNDLE_ROOT/${name}.vst3"
  if [[ ! -d "$src" ]]; then
    # Fallback: search (Ninja single-config sometimes nests differently).
    src="$(find "$BUILD" -type d -name "${name}.vst3" 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$src" || ! -d "$src" ]]; then
    echo "error: missing built bundle ${name}.vst3 under $BUILD" >&2
    exit 1
  fi
  dst="$SHOW_DEST/${name}.vst3"
  echo "  $name.vst3 → $dst"
  rm -rf "$dst"
  mkdir -p "$dst"
  cp -a "$src"/. "$dst"/
done

echo "==> done (reload plugins in host)"
for name in "${VST3_NAMES[@]}"; do
  ls -la "$SHOW_DEST/${name}.vst3/Contents/Resources/assets/"*.{js,css} 2>/dev/null | head -5 || true
done
