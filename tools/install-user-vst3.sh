#!/usr/bin/env bash
# Force-rebuild the SPA UI, embed into VST3 Resources, install to ~/.vst3.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${BUILD_DIR:-$ROOT/build}"
JOBS="${JOBS:-$(nproc)}"

if [[ ! -d "$BUILD" ]]; then
  echo "error: build dir missing: $BUILD" >&2
  echo "  configure first: cmake -S \"$ROOT\" -B \"$BUILD\" -DCMAKE_BUILD_TYPE=Release" >&2
  exit 1
fi

# UI embed only runs when stamps are stale; clear them after manual UI edits.
rm -f "$ROOT/ui/dist/.stamp"
rm -f "$BUILD"/calfnxt-*.resources.stamp

echo "==> build + install-user-vst3 (-j$JOBS)"
cmake --build "$BUILD" --target install-user-vst3 -j"$JOBS"
echo "==> done → ~/.vst3 (reload plugins in host)"
