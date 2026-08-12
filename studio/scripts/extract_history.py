#!/usr/bin/env python3
"""Best-effort: sample history/envelope curves from website/images/*.png into fixtures.

Usage (from repo root or studio/):
  python3 studio/scripts/extract_history.py
  python3 studio/scripts/extract_history.py compressor

Requires Pillow. Overwrites only the `envelope` field in fixtures/<id>/viz.json
(other viz keys are preserved). Falls back silently if the PNG is missing.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    raise SystemExit("Pillow required: pip install Pillow") from e

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "website" / "images"
FIXTURES = ROOT / "studio" / "fixtures"

# Rough chart rects as fractions of image size (tuned to current host screenshots).
# (left, top, right, bottom) in 0…1
CHART_RECT = {
    "compressor": (0.04, 0.14, 0.96, 0.52),
    "deesser": (0.04, 0.14, 0.96, 0.52),
    "transients": (0.04, 0.16, 0.96, 0.58),
}

DB_MAX = 0.0
DB_MIN = -48.0
SLOTS = 240


def db_to_lin(db: float) -> float:
    if db <= DB_MIN:
        return 0.0
    return 10 ** (db / 20.0)


def sample_blue_peak_db(img: Image.Image, x: int, y0: int, y1: int) -> float | None:
    """Find uppermost bright blue-ish pixel in column → dB."""
    px = img.load()
    best_y = None
    for y in range(y0, y1):
        r, g, b, *rest = px[x, y] if img.mode == "RGBA" else (*px[x, y], 255)
        # accent blue / cyan strokes
        if b > 140 and b > r + 30 and b >= g - 10:
            best_y = y
            break
        # fallback: any bright non-grid pixel
        if best_y is None and max(r, g, b) > 180 and min(r, g, b) < 120:
            best_y = y
            break
    if best_y is None:
        return None
    t = (best_y - y0) / max(1, y1 - y0 - 1)
    return DB_MAX + t * (DB_MIN - DB_MAX)


def sample_gr_db(img: Image.Image, x: int, y0: int, y1: int) -> float:
    """Sample magenta/gray GR fill depth (heuristic)."""
    px = img.load()
    deep = y1 - 1
    for y in range(y0, y1):
        r, g, b, *rest = px[x, y] if img.mode == "RGBA" else (*px[x, y], 255)
        # warn / GR gradient or dim fill
        if (r > 100 and b > 80 and g < 90) or (40 < max(r, g, b) < 110 and abs(r - b) < 40):
            deep = y
    t = (deep - y0) / max(1, y1 - y0 - 1)
    # GR as negative dB for lin conversion (meter uses magnitude separately)
    return DB_MIN * t * 0.35


def extract_2ch(path: Path, rect: tuple[float, float, float, float]) -> list[float]:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    x0, y0 = int(rect[0] * w), int(rect[1] * h)
    x1, y1 = int(rect[2] * w), int(rect[3] * h)
    out: list[float] = []
    for i in range(SLOTS):
        x = x0 + int(i * (x1 - x0 - 1) / max(1, SLOTS - 1))
        adb = sample_blue_peak_db(img, x, y0, y1)
        if adb is None:
            adb = DB_MIN + 6
        gdb = sample_gr_db(img, x, y0, y1)
        out.append(db_to_lin(adb))
        out.append(db_to_lin(gdb))
    out.append(0.0)
    return out


def extract_3ch(path: Path, rect: tuple[float, float, float, float]) -> list[float]:
    """Audio + approximate filtered detector + GR (DeEsser / Compressor layout)."""
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    x0, y0 = int(rect[0] * w), int(rect[1] * h)
    x1, y1 = int(rect[2] * w), int(rect[3] * h)
    out: list[float] = []
    for i in range(SLOTS):
        x = x0 + int(i * (x1 - x0 - 1) / max(1, SLOTS - 1))
        adb = sample_blue_peak_db(img, x, y0, y1)
        if adb is None:
            adb = DB_MIN + 6
        gdb = sample_gr_db(img, x, y0, y1)
        audio = db_to_lin(adb)
        # Filtered often sits below the fullband peak in the same chart.
        filt = db_to_lin(adb - 4.0) * (0.55 + 0.2 * abs(math.sin(i * 0.13)))
        out.append(audio)
        out.append(filt)
        out.append(db_to_lin(gdb))
    out.append(0.0)
    return out


def extract_transients(path: Path, rect: tuple[float, float, float, float]) -> list[float]:
    """Map a single sampled curve into 5 envelope channels (approx)."""
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    x0, y0 = int(rect[0] * w), int(rect[1] * h)
    x1, y1 = int(rect[2] * w), int(rect[3] * h)
    out: list[float] = []
    for i in range(180):
        x = x0 + int(i * (x1 - x0 - 1) / 179)
        adb = sample_blue_peak_db(img, x, y0, y1)
        if adb is None:
            adb = -24
        lin = db_to_lin(adb)
        out.extend([lin, lin * 0.95, lin * 0.9, lin * 0.55, lin * 0.3])
    out.append(0.0)
    return out


def merge_envelope(plugin: str, envelope: list[float]) -> None:
    viz_path = FIXTURES / plugin / "viz.json"
    viz: dict = {}
    if viz_path.is_file():
        viz = json.loads(viz_path.read_text())
    viz["envelope"] = envelope
    viz_path.parent.mkdir(parents=True, exist_ok=True)
    viz_path.write_text(json.dumps(viz, indent=2) + "\n")
    print(f"updated {viz_path} ({len(envelope)} floats)")


def main() -> None:
    want = sys.argv[1:] or ["compressor", "deesser", "transients"]
    for plugin in want:
        png = IMAGES / f"{plugin}.png"
        if not png.is_file():
            print(f"skip {plugin}: missing {png}")
            continue
        rect = CHART_RECT.get(plugin)
        if not rect:
            print(f"skip {plugin}: no chart rect")
            continue
        if plugin == "transients":
            env = extract_transients(png, rect)
        elif plugin in ("compressor", "deesser"):
            env = extract_3ch(png, rect)
            for c in (0, 1, 2):
                for i in range(1, SLOTS - 1):
                    a = env[(i - 1) * 3 + c]
                    b = env[i * 3 + c]
                    d = env[(i + 1) * 3 + c]
                    env[i * 3 + c] = 0.25 * a + 0.5 * b + 0.25 * d
        else:
            env = extract_2ch(png, rect)
            for c in (0, 1):
                for i in range(1, SLOTS - 1):
                    a = env[(i - 1) * 2 + c]
                    b = env[i * 2 + c]
                    d = env[(i + 1) * 2 + c]
                    env[i * 2 + c] = 0.25 * a + 0.5 * b + 0.25 * d
        merge_envelope(plugin, env)


if __name__ == "__main__":
    main()
