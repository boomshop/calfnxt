#!/usr/bin/env bash
# Build + run Tuner click probe with regression history.
# Usage:
#   ./tools/run_tuner_click.sh LABEL                 # synth suite
#   ./tools/run_tuner_click.sh LABEL --wav PATH      # wav (+ optional synth)
#   ./tools/run_tuner_click.sh LABEL --only-wav --wav PATH
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LABEL="${1:-unlabeled}"
shift || true
BIN=/tmp/tuner_click_test
HIST="$ROOT/tools/tuner_click_history.jsonl"
g++ -O2 -std=c++17 -I common/dsp tools/tuner_click_test.cpp -o "$BIN" -lm
"$BIN" --label "$LABEL" --history "$HIST" "$@"
