#!/usr/bin/env python3
"""Convert a live WebKit viz capture object into studio fixtures/*/viz.json."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"


def expand_comp_envelope_2ch_to_3ch(env: list) -> list:
    """Old captures were [audio, gr]×slots(+phase); UI/DSP now use 3 channels."""
    if not env:
        return env
    phase = None
    data = list(env)
    if len(data) % 2 == 1:
        phase = data.pop()
    if len(data) % 2 != 0:
        return env
    out: list[float] = []
    for i in range(0, len(data), 2):
        audio = float(data[i])
        gr = float(data[i + 1])
        # Approximate filtered (sidechain) channel — same factor as the
        # studio expansion when the third history graph was added.
        out.extend([audio, audio * 0.45, gr])
    if phase is not None:
        out.append(float(phase))
    return out


def to_viz(d: dict, plugin: str = "") -> dict:
    viz: dict = {}
    if "in:levels" in d:
        viz["levelsIn"] = d["in:levels"]
    if "out:levels" in d:
        viz["levelsOut"] = d["out:levels"]

    for env_key in ("env:envelope", "comp:envelope", "deess:envelope", "exp:envelope"):
        if env_key in d:
            viz["envelope"] = d[env_key]
            break

    for gr_key in ("comp:gr", "deess:gr", "exp:gr"):
        if gr_key in d:
            gr = d[gr_key]
            v = gr[0] if isinstance(gr, list) else gr
            viz["gr"] = abs(float(v))
            break
    if "comp:point" in d:
        viz["point"] = d["comp:point"]
    if "exp:point" in d and "point" not in viz:
        viz["point"] = d["exp:point"]

    # Passthrough already-mapped keys
    for k in ("levelsIn", "levelsOut", "envelope", "gr", "point", "corr", "gonio", "tempo", "gains"):
        if k in d and k not in viz:
            viz[k] = d[k]

    env = viz.get("envelope")
    if plugin == "compressor" and isinstance(env, list) and env:
        body_len = len(env) - 1 if len(env) % 2 == 1 else len(env)
        # 2ch live capture → 3ch (full, filtered, gr).
        if body_len % 2 == 0 and body_len % 3 != 0:
            viz["envelope"] = expand_comp_envelope_2ch_to_3ch(env)

    # Near-silence meter snapshots look empty in studio shots — keep readable demo levels.
    for key, fallback in (("levelsIn", [-12.0, -12.5]), ("levelsOut", [-13.0, -13.4])):
        levels = viz.get(key)
        if isinstance(levels, list) and levels and all(
            isinstance(x, (int, float)) and float(x) < -24.0 for x in levels
        ):
            viz[key] = list(fallback)

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
    viz = to_viz(d, args.plugin)
    out = FIXTURES / args.plugin / "viz.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(viz, indent=2) + "\n")
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    for k, v in viz.items():
        if isinstance(v, list):
            print(f"  {k}: len={len(v)}")
        else:
            print(f"  {k}: {v}")
    env = viz.get("envelope")
    if isinstance(env, list) and args.plugin in ("compressor", "deesser", "expander"):
        n_ch = 3
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
