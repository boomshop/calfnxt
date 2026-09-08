#!/usr/bin/env bash
# Offline Octaver gate using the REAL OctaverPlugin::process (not a cloned hop loop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LABEL="${1:-unlabeled}"
if [[ $# -gt 0 ]]; then
  shift || true
fi

BUILD="${CALFNXT_BUILD_DIR:-$ROOT/build}"
BIN="$BUILD/tools/offline/calfnxt-offline-octaver"
LOG="${CALFNXT_OCTAVER_DIAG_LOG:-/tmp/calfnxt-octaver-offline.log}"

echo "=== build real-DSP offline octaver ==="
cmake --build "$BUILD" --target calfnxt-offline-octaver -j"$(nproc)"

echo "=== run OctaverPlugin on WAV (diag + score) ==="
CALFNXT_OCTAVER_DIAG=1 CALFNXT_OCTAVER_DIAG_LOG="$LOG" \
  "$BIN" --log "$LOG" --start 30 --sec 60 "$@"

echo "diag → $LOG"
echo "label=$LABEL ALL PASS"
