#!/usr/bin/env bash
# Deprecated name — forwards to the real-DSP offline octaver harness.
exec "$(cd "$(dirname "$0")" && pwd)/run_octaver_regression.sh" hop-diag "$@"
