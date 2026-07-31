#!/usr/bin/env bash
# Build plugins + force-rebuild SPA UI into VST3 Resources, install to ~/.vst3.
# Prefer this (or cmake --target install-user-vst3) over bare *-resources copies:
# install-user-vst3 always clears UI stamps so testers cannot keep stale assets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${BUILD_DIR:-$ROOT/build}"
JOBS="${JOBS:-$(nproc)}"

if [[ ! -d "$BUILD" ]]; then
  echo "error: build dir missing: $BUILD" >&2
  echo "  configure first: cmake -S \"$ROOT\" -B \"$BUILD\" -DCMAKE_BUILD_TYPE=Release" >&2
  exit 1
fi

echo "==> install-user-vst3 (forces UI rebuild) (-j$JOBS)"
cmake --build "$BUILD" --target install-user-vst3 -j"$JOBS"
echo "==> done → ~/.vst3 (reload plugins in host)"
