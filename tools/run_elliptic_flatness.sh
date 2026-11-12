#!/usr/bin/env bash
# Fail if the elliptic crossover notches the mono sum or the Amount-0 path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BIN=/tmp/calfnxt_elliptic_flatness
g++ -O2 -std=c++17 -I common/dsp -I dsp/elliptic/source tools/elliptic_flatness.cpp -o "$BIN" -lm
"$BIN"
