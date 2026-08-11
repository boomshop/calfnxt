#!/usr/bin/env python3
"""Convert a live WebKit viz capture object into studio fixtures/*/viz.json."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"


def to_viz(d: dict) -> dict:
    viz: dict = {}
    if "in:levels" in d:
        viz["levelsIn"] = d["in:levels"]
    if "out:levels" in d:
        viz["levelsOut"] = d["out:levels"]

    for env_key in ("env:envelope", "comp:envelope", "deess:envelope"):
        if env_key in d:
            viz["envelope"] = d[env_key]
            break

    for gr_key in ("comp:gr", "deess:gr"):
        if gr_key in d:
            gr = d[gr_key]
            v = gr[0] if isinstance(gr, list) else gr
            viz["gr"] = abs(float(v))
            break
    if "comp:point" in d:
        viz["point"] = d["comp:point"]

    # Passthrough already-mapped keys
    for k in ("levelsIn", "levelsOut", "envelope", "gr", "point", "corr", "gonio", "tempo", "gains"):
        if k in d and k not in viz:
            viz[k] = d[k]
    return viz


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("plugin", help="fixture folder name, e.g. compressor")
    ap.add_argument("capture", nargs="?", help="capture .json path (stdin if omitted)")
    args = ap.parse_args()

    raw = Path(args.capture).read_text() if args.capture else sys.stdin.read()
    raw = raw.strip()
    if raw.startswith("[Log]"):
        raw = raw[len("[Log]") :].strip()
    d = json.loads(raw)
    viz = to_viz(d)
    out = FIXTURES / args.plugin / "viz.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(viz) + "\n")
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    for k, v in viz.items():
        if isinstance(v, list):
            print(f"  {k}: len={len(v)}")
        else:
            print(f"  {k}: {v}")
    env = viz.get("envelope")
    if isinstance(env, list) and args.plugin in ("compressor", "deesser"):
        n_ch = 3 if args.plugin == "deesser" else 2
        rem = len(env) % n_ch
        if rem not in (0, 1):
            print(
                f"warning: envelope length {len(env)} not aligned to "
                f"{n_ch} channels (+ optional phase); capture may be truncated",
                file=sys.stderr,
            )
        elif rem == 0:
            print(
                f"note: envelope has no trailing phase "
                f"(expected {n_ch}*slots+1 from live DSP)",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
