#!/usr/bin/env bash
# E2E: render m1-only (dry off), YIN every 100 ms — output F0 must be ~input/2.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BIN=/tmp/octaver_pitch_verify
g++ -O2 -std=c++17 -I common/dsp tools/octaver_pitch_verify.cpp -o "$BIN" -lm
"$BIN" --start 30 --sec 60 "$@"
