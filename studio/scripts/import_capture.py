#!/usr/bin/env python3
"""Convert a live WebKit viz capture object into studio fixtures/*/viz.json."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"


def expand_comp_envelope_to_4ch(env: list) -> list:
    """Normalize compressor captures to [trigger, gr, out, thresh]×slots(+phase).

    Live DSP is 4 channels. Older fixtures:
    5ch [raw, filt, gr, out, thresh], 3ch [audio, filt, gr], 2ch [audio, gr].
    """
    if not env:
        return env
    data = [float(x) for x in env]
    n = len(data)

    def split(n_ch: int):
        if n % n_ch == 1:
            return data[:-1], data[-1]
        if n % n_ch == 0:
            return data, None
        return None, None

    def looks_like_nch(body: list[float], n_ch: int, thr_idx: int) -> bool:
        if len(body) < n_ch:
            return False
        th = [body[i] for i in range(thr_idx, len(body), n_ch)]
        if not th:
            return False
        mean = sum(th) / len(th)
        return max(th) - min(th) <= max(1e-4, abs(mean) * 0.05)

    body4, phase4 = split(4)
    if body4 is not None and (n % 4 == 0 or looks_like_nch(body4, 4, 3)):
        out = list(body4)
        if phase4 is not None:
            out.append(phase4)
        return out

    body5, phase5 = split(5)
    if body5 is not None and (n % 5 == 0 or looks_like_nch(body5, 5, 4)):
        # Drop raw trigger; keep filtered as trigger.
        out = []
        for i in range(0, len(body5), 5):
            _raw, filt, gr, outp, thr = body5[i : i + 5]
            out.extend([filt, gr, outp, thr])
        if phase5 is not None:
            out.append(phase5)
        return out

    body3, phase3 = split(3)
    if body3 is not None:
        out = []
        for i in range(0, len(body3), 3):
            audio, filt, gr = body3[i], body3[i + 1], body3[i + 2]
            out.extend([filt, gr, audio * 0.85, 0.071])
        if phase3 is not None:
            out.append(phase3)
        return out

    body2, phase2 = split(2)
    if body2 is not None:
        out = []
        for i in range(0, len(body2), 2):
            audio, gr = body2[i], body2[i + 1]
            out.extend([audio, gr, audio * 0.85, 0.071])
        if phase2 is not None:
            out.append(phase2)
        return out

    return env


def expand_deess_envelope_to_5ch(env: list) -> list:
    """Normalize deesser captures to [trigger, gr, post, thresh, pre]×slots(+phase).

    Live DSP is 5 channels. Older fixtures were 4ch (no pre) or legacy 3/2ch.
    """
    if not env:
        return env
    data = [float(x) for x in env]
    n = len(data)

    def split(n_ch: int):
        if n % n_ch == 1:
            return data[:-1], data[-1]
        if n % n_ch == 0:
            return data, None
        return None, None

    body5, phase5 = split(5)
    if body5 is not None:
        out = list(body5)
        if phase5 is not None:
            out.append(phase5)
        return out

    # 4ch [trigger, gr, post, thresh] → synthesize pre ≈ post / gr.
    body4, phase4 = split(4)
    if body4 is not None:
        out: list[float] = []
        for i in range(0, len(body4), 4):
            trig, gr, post, thr = body4[i : i + 4]
            g = gr if gr > 1e-6 else 1.0
            pre = post / g if g < 0.999 else post
            out.extend([trig, gr, post, thr, pre])
        if phase4 is not None:
            out.append(phase4)
        return out

    # Fall back through compressor normalizer then pad pre.
    as4 = expand_comp_envelope_to_4ch(env)
    return expand_deess_envelope_to_5ch(as4) if as4 is not env else env


def expand_exp_envelope_to_8ch(env: list) -> list:
    """Normalize expander history to 8ch.

    Live: [trig, gr, out, thresh, inv1Amt, inv2Amt, inv1Peak, inv2Peak].
    Legacy 6ch → pad inv peaks; 4ch/3ch via 6ch path then pad.
    """
    if not env:
        return env
    data = [float(x) for x in env]
    phase = None
    n = len(data)
    if n % 8 == 1 or n % 6 == 1 or n % 4 == 1 or n % 3 == 1:
        phase = data[-1]
        data = data[:-1]
        n = len(data)

    def finish(body: list[float]) -> list[float]:
        if phase is not None:
            body.append(float(phase))
        return body

    def pad6_to_8(body6: list[float]) -> list[float]:
        out: list[float] = []
        for i in range(0, len(body6), 6):
            slot = body6[i : i + 6]
            trig, amt1, amt2 = slot[0], slot[4], slot[5]
            out.extend(slot)
            out.append(abs(trig) * (0.4 + 0.6 * max(0.0, amt1)))
            out.append(abs(trig) * (0.3 + 0.5 * max(0.0, amt2)))
        return out

    if n % 8 == 0 and n > 0:
        return finish(list(data))

    # Reuse 6ch normalizer on a synthetic list (no phase — we already stripped it).
    six = expand_exp_envelope_to_6ch(list(data))
    if len(six) % 6 == 1:
        six = six[:-1]
    if len(six) % 6 != 0:
        return env
    return finish(pad6_to_8(six))


def expand_exp_envelope_to_6ch(env: list) -> list:
    """Normalize expander history to [trig, gr, out, thresh, inv1, inv2].

    Used as a step toward 8ch. Legacy:
    - 6ch already → pass through
    - 4ch compressor layout [trig, gr, out, thresh] → pad inv1/inv2 = 0
    - 4ch old [audio, det, gr, inhibit] → [det, gr, audio×gr, thresh, inhibit, 0]
    - 3ch [audio, det, gr] → pad thresh + invs
    """
    if not env:
        return env
    data = [float(x) for x in env]
    phase = None
    n = len(data)
    if n % 6 == 1 or n % 4 == 1 or n % 3 == 1:
        phase = data[-1]
        data = data[:-1]
        n = len(data)

    def finish(body: list[float]) -> list[float]:
        if phase is not None:
            body.append(float(phase))
        return body

    if n % 6 == 0 and n > 0:
        return finish(list(data))

    if n % 4 == 0 and n > 0:
        sample_gr = [data[i + 1] for i in range(0, min(n, 40), 4)]
        sample_thr = [data[i + 3] for i in range(0, min(n, 40), 4)]
        gr_ok = sample_gr and max(sample_gr) <= 1.01 and min(sample_gr) > 0
        thr_ok = sample_thr and max(sample_thr) <= 1.01 and min(sample_thr) > 0
        near_unity = (
            gr_ok
            and sum(1 for g in sample_gr if g > 0.5) >= max(1, len(sample_gr) // 3)
        )
        out: list[float] = []
        if near_unity and thr_ok:
            # Compressor-layout 4ch → pad Inv amounts.
            for i in range(0, n, 4):
                out.extend([*data[i : i + 4], 0.0, 0.0])
            return finish(out)

        # Legacy [audio, det, gr, inhibit].
        thresh = 0.025119  # ≈ −32 dB
        for i in range(0, n, 4):
            audio, det, gr, inh = data[i : i + 4]
            gr_c = gr if gr > 0.0 else 1.0
            out.extend([det, gr_c, abs(audio) * gr_c, thresh, max(0.0, inh), 0.0])
        return finish(out)

    if n % 3 == 0 and n > 0:
        thresh = 0.025119
        out = []
        for i in range(0, n, 3):
            audio, det, gr = data[i : i + 3]
            gr_c = gr if gr > 0.0 else 1.0
            out.extend([det, gr_c, abs(audio) * gr_c, thresh, 0.0, 0.0])
        return finish(out)

    return env


def expand_mbcomp_envelope_to_3ch(env: list, thresh_lin: float = 0.1) -> list:
    """Normalize mbcomp captures to [bandOut, gr, thresh]×slots×bands(+phase).

    Live DSP is 3 channels per band. Older layouts:
    4ch [full/in, band, gr, thresh], 3ch [full, band, gr] without thresh.
    """
    if not env:
        return env
    data = [float(x) for x in env]
    n = len(data)
    phase = None
    if n % 4 == 1 or n % 3 == 1:
        phase = data[-1]
        data = data[:-1]
        n = len(data)

    def looks_like_thresh(body: list[float], n_ch: int, thr_idx: int) -> bool:
        if len(body) < n_ch * 2:
            return False
        # Per-band thresh can differ; check short windows stay flat.
        step = n_ch * 8
        for start in range(thr_idx, min(len(body), thr_idx + step * 4), step):
            th = [body[i] for i in range(start, min(len(body), start + step), n_ch)]
            if len(th) < 2:
                continue
            mean = sum(th) / len(th)
            if max(th) - min(th) <= max(1e-4, abs(mean) * 0.05):
                return True
        return False

    # Already live 3ch [bandOut, gr, thresh] (thresh stable per short window).
    # Check before 4ch: body length is often divisible by both 3 and 4.
    if n % 3 == 0 and looks_like_thresh(data, 3, 2):
        out = list(data)
        if phase is not None:
            out.append(phase)
        return out

    # Recent dumps: 4ch [in, band, gr, thresh] → drop redundant in.
    if n % 4 == 0:
        out = []
        for i in range(0, n, 4):
            out.extend([data[i + 1], data[i + 2], data[i + 3]])
        if phase is not None:
            out.append(phase)
        return out

    # Legacy 3ch [full, band, gr] → [band, gr, thresh].
    if n % 3 == 0:
        out = []
        for i in range(0, n, 3):
            out.extend([data[i + 1], data[i + 2], thresh_lin])
        if phase is not None:
            out.append(phase)
        return out

    return env


def to_viz(d: dict, plugin: str = "") -> dict:
    viz: dict = {}
    if "in:levels" in d:
        viz["levelsIn"] = d["in:levels"]
    if "out:levels" in d:
        viz["levelsOut"] = d["out:levels"]

    if "fft:spectrum" in d:
        viz["spectrum"] = d["fft:spectrum"]
    if "fft_in:spectrum" in d:
        viz["spectrumIn"] = d["fft_in:spectrum"]
    if "fft_out:spectrum" in d:
        viz["spectrumOut"] = d["fft_out:spectrum"]
    if "tamer:response" in d:
        viz["response"] = d["tamer:response"]
    if "loud:loudness" in d:
        viz["loudness"] = d["loud:loudness"]
    # Analyzer / Stereo share the stereo viz id for gonio + correlation.
    if "stereo:gonio" in d:
        viz["gonio"] = d["stereo:gonio"]
    if "stereo:corr" in d:
        corr = d["stereo:corr"]
        if isinstance(corr, list) and corr:
            viz["corr"] = float(corr[0])
        elif isinstance(corr, (int, float)):
            viz["corr"] = float(corr)
    # Generic response / spectrum aliases used by some plugins.
    for src, dst in (
        ("mod:response", "response"),
        ("phaser:response", "response"),
        ("flanger:response", "response"),
        ("chorus:response", "response"),
    ):
        if src in d and dst not in viz:
            viz[dst] = d[src]

    for env_key in (
        "env:envelope",
        "comp:envelope",
        "deess:envelope",
        "exp:envelope",
        "limiter:envelope",
        "mbcomp:envelope",
        "mblimiter:envelope",
        "tuner:pitch",
        "octaver:pitch",
    ):
        if env_key in d:
            viz["envelope"] = d[env_key]
            break

    for gr_key in ("comp:gr", "deess:gr", "exp:gr", "limiter:gr"):
        if gr_key in d:
            gr = d[gr_key]
            v = gr[0] if isinstance(gr, list) else gr
            viz["gr"] = abs(float(v))
            break

    # Multiband: keep full GR/gains/bandio/point arrays (≤0 dB where applicable).
    for src, dst in (
        ("mbcomp:gr", "gr"),
        ("mbcomp:gains", "gains"),
        ("mbcomp:bandio", "bandio"),
        ("mbcomp:point", "point"),
        ("mblimiter:gr", "gr"),
        ("mblimiter:gains", "gains"),
        ("mblimiter:bandio", "bandio"),
        ("eq:gains", "gains"),
    ):
        if src in d and dst not in viz:
            viz[dst] = d[src]

    if "comp:point" in d:
        viz["point"] = d["comp:point"]
    if "exp:point" in d and "point" not in viz:
        viz["point"] = d["exp:point"]
    if "exp:unit" in d and "unit" not in viz:
        viz["unit"] = d["exp:unit"]

    # Passthrough already-mapped keys
    for k in (
        "levelsIn",
        "levelsOut",
        "envelope",
        "gr",
        "point",
        "unit",
        "corr",
        "gonio",
        "tempo",
        "gains",
        "bandio",
        "spectrum",
        "spectrumIn",
        "spectrumOut",
    ):
        if k in d and k not in viz:
            viz[k] = d[k]

    env = viz.get("envelope")
    if plugin == "compressor" and isinstance(env, list) and env:
        # Legacy 2/3/5ch → 4ch (trigger, gr, out, thresh); 4ch passes through.
        viz["envelope"] = expand_comp_envelope_to_4ch(env)
    if plugin == "deesser" and isinstance(env, list) and env:
        # Live 5ch [trigger, gr, post, thresh, pre]; legacy 4ch padded.
        viz["envelope"] = expand_deess_envelope_to_5ch(env)
    if plugin == "expander" and isinstance(env, list) and env:
        # Live 8ch; legacy 6/4/3 → pad inv peaks.
        viz["envelope"] = expand_exp_envelope_to_8ch(env)
    if plugin == "mbcomp" and isinstance(env, list) and env:
        viz["envelope"] = expand_mbcomp_envelope_to_3ch(env)

    # Near-silence meter snapshots look empty in studio shots — keep readable demo levels.
    for key, fallback in (("levelsIn", [-12.0, -12.5]), ("levelsOut", [-13.0, -13.4])):
        levels = viz.get(key)
        if isinstance(levels, list) and levels and all(
            isinstance(x, (int, float)) and float(x) < -24.0 for x in levels
        ):
            viz[key] = list(fallback)
        elif isinstance(levels, list) and len(levels) >= 2:
            # Live captures often mute one side (−96); mirror the live channel.
            a, b = float(levels[0]), float(levels[1])
            if b < -60.0 and a > -60.0:
                viz[key] = [a, a - 0.4]
            elif a < -60.0 and b > -60.0:
                viz[key] = [b - 0.4, b]

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
    n_ch = {
        "compressor": 4,
        "deesser": 5,
        "expander": 8,
        "tuner": 5,
        "octaver": 5,
        "limiter": 3,
        "mbcomp": 3,
        "mblimiter": 3,
    }.get(args.plugin)
    if isinstance(env, list) and n_ch:
        # Mbcomp/mblimiter pack N bands × n_ch × slots (+ phase).
        body = len(env) - 1 if len(env) % n_ch == 1 else len(env)
        if body % n_ch != 0:
            print(
                f"warning: envelope length {len(env)} not aligned to "
                f"{n_ch} channels × bands (+ optional phase); capture may be truncated",
                file=sys.stderr,
            )
        elif len(env) % n_ch == 0:
            print(
                f"note: envelope has no trailing phase "
                f"(expected {n_ch}*slots*bands+1 from live DSP)",
                file=sys.stderr,
            )
        elif args.plugin in ("mbcomp", "mblimiter"):
            bands = body // n_ch
            # Prefer reporting slots if evenly divisible by common band counts.
            for nb in (6, 5, 4, 3, 2):
                if bands % nb == 0:
                    slots = bands // nb
                    print(f"  envelope layout: {nb} bands × {slots} slots × {n_ch}ch")
                    break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
