#!/usr/bin/env bash
# Fail if BandSplitter band-sum is not cancellation-free (magnitude flat).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BIN=/tmp/calfnxt_band_splitter_flatness
g++ -O2 -std=c++17 -I common/dsp tools/band_splitter_flatness.cpp -o "$BIN" -lm
"$BIN"
