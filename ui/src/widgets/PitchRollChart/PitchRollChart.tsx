import { useCallback, useEffect, useRef } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../utils/bridge';
import { useThemeColors } from '../../theme/themeColors';
import './PitchRollChart.scss';

/** Fixed history window (ms) — keep in sync with Tuner DSP. */
export const PITCH_ROLL_MS = 10000;
const HIST_CH = 5;

const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];

function useNoteMask(notes$: readonly DynamicValue<boolean>[]): boolean[] {
  const n0 = useDynamicValueReadonly(notes$[0], false);
  const n1 = useDynamicValueReadonly(notes$[1], false);
  const n2 = useDynamicValueReadonly(notes$[2], false);
  const n3 = useDynamicValueReadonly(notes$[3], false);
  const n4 = useDynamicValueReadonly(notes$[4], false);
  const n5 = useDynamicValueReadonly(notes$[5], false);
  const n6 = useDynamicValueReadonly(notes$[6], false);
  const n7 = useDynamicValueReadonly(notes$[7], false);
  const n8 = useDynamicValueReadonly(notes$[8], false);
  const n9 = useDynamicValueReadonly(notes$[9], false);
  const n10 = useDynamicValueReadonly(notes$[10], false);
  const n11 = useDynamicValueReadonly(notes$[11], false);
  return [n0, n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11];
}

function isBlack(pc: number): boolean {
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

function midiFromHz(hz: number, ref = 440): number {
  if (!(hz > 1)) return 69;
  return 69 + 12 * Math.log2(hz / ref);
}

function readCss(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function withAlpha(css: string, a: number): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(css);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
  const h = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (h) {
    const n = parseInt(h[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return css;
}

/** 0 ct = black, 100 = accent, 200 = warn, 400 = white. 1 px = 1 cent. */
const CORR_LUT_CENTS = 400;
let corrLutKey = '';
let corrLut: Uint8ClampedArray | null = null;

/**
 * Sample a CSS-style sRGB gradient (same mix as canvas/CSS linear-gradient
 * between adjacent stops — no extra hues between accent and warn).
 */
function corrFill(cents: number, accent: string, warn: string): string {
  const key = `${accent}|${warn}`;
  if (!corrLut || corrLutKey !== key) {
    const c = document.createElement('canvas');
    c.width = CORR_LUT_CENTS + 1;
    c.height = 1;
    const gctx = c.getContext('2d');
    if (!gctx) return accent;
    const g = gctx.createLinearGradient(0, 0, CORR_LUT_CENTS, 0);
    g.addColorStop(0, '#000000');
    g.addColorStop(100 / CORR_LUT_CENTS, accent);
    g.addColorStop(200 / CORR_LUT_CENTS, warn);
    g.addColorStop(1, '#ffffff');
    gctx.fillStyle = g;
    gctx.fillRect(0, 0, CORR_LUT_CENTS + 1, 1);
    corrLut = gctx.getImageData(0, 0, CORR_LUT_CENTS + 1, 1).data;
    corrLutKey = key;
  }
  const i = Math.max(0, Math.min(CORR_LUT_CENTS, Math.round(Math.abs(cents))));
  const o = i * 4;
  return `rgb(${corrLut[o]},${corrLut[o + 1]},${corrLut[o + 2]})`;
}

/** Midpoint of accent→warn (same stop as the correction strip at 150 ct). */
function midAccentWarn(accent: string, warn: string): string {
  return corrFill(150, accent, warn);
}

/** Shared dashed style for dry (Octaver) and target (Tuner). */
const PITCH_DASH_TIGHT: number[] = [2, 2];

export interface PitchRollChartProps {
  data$: DynamicValue<Float32Array | null>;
  fmin$: DynamicValue<number>;
  fmax$: DynamicValue<number>;
  /** Allowed pitch classes 0=C … 11=B. */
  notes$: readonly DynamicValue<boolean>[];
  /** When false, hide the detected-pitch (blue) trace. Default on. */
  showIn$?: DynamicValue<boolean>;
  /** When false, hide the scale-target (dashed) trace. Default on. */
  showTarg$?: DynamicValue<boolean>;
  /** When false, hide the processed-pitch (warn) trace. Default on. */
  showOut$?: DynamicValue<boolean>;
  /**
   * `tuner` (default): [in, target, conf, flags, corrCents].
   * `octaver`: [inMidi, layerBits, conf, flags, _] with layerBits
   * dry=1, −1=2, −2=4, +1=8, sub=16.
   */
  mode?: 'tuner' | 'octaver';
  /** Bottom pull/confidence strip (tuner only by default). */
  showConfidenceStrip?: boolean;
  vizId?: string;
  className?: string;
}

/**
 * Scrolling Melodyne-style piano roll (display only). Newest is on the right.
 * Buffer layout matches DSP: [inMidi, targetMidi, conf, flags, corrCents] × slots + phase.
 * corrCents is the actual pitch shift (retune + added vibrato).
 */
export function PitchRollChart(props: PitchRollChartProps) {
  const {
    data$,
    fmin$,
    fmax$,
    notes$,
    vizId = 'tuner',
    className,
    showIn$,
    showTarg$,
    showOut$,
    mode = 'tuner',
    showConfidenceStrip = true,
  } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pitchData = useDynamicValueReadonly(data$, null);
  const fmin = useDynamicValueReadonly(fmin$, 31);
  const fmax = useDynamicValueReadonly(fmax$, 400);
  const notes = useNoteMask(notes$);
  const showIn = useDynamicValueReadonly(showIn$, true);
  const showTarg = useDynamicValueReadonly(showTarg$, true);
  const showOut = useDynamicValueReadonly(showOut$, true);
  const theme = useThemeColors();
  const modeRef = useRef(mode);
  const showStripRef = useRef(showConfidenceStrip);
  modeRef.current = mode;
  showStripRef.current = showConfidenceStrip;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(1, wrap.clientWidth);
    const cssH = Math.max(1, wrap.clientHeight);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    void theme;

    const bg = readCss(wrap, '--background', '#000');
    const fg = readCss(wrap, '--color', '#fff');
    const lesser = readCss(wrap, '--background-lesser', '#1b1b1b');
    // White keys always lighter than black, in both day and night.
    const day = document.documentElement.classList.contains('day');
    const laneWhite = day ? bg : lesser;
    const laneBlack = day ? lesser : bg;
    const least = readCss(wrap, '--color-least', '#999');
    const accent = readCss(wrap, '--color-accent', '#0066ff');
    const warn = readCss(wrap, '--color-warn', '#ff0066');
    const keyWhiteOn = readCss(wrap, '--key-white-on', '#e8e8e8');
    const keyWhiteOff = readCss(wrap, '--key-white-off', '#9a9a9a');
    const keyBlackOn = readCss(wrap, '--key-black-on', '#141414');
    const keyBlackOff = readCss(wrap, '--key-black-off', '#5a5a5a');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const keyW = 28;
    const stripH = showStripRef.current ? 8 : 0;
    const plotW = Math.max(1, cssW - keyW);
    const plotH = Math.max(1, cssH - stripH);
    const midiLo = Math.max(12, Math.floor(midiFromHz(fmin)) - 2);
    const midiHi = Math.min(108, Math.ceil(midiFromHz(fmax)) + 2);
    const midiSpan = Math.max(1, midiHi - midiLo);
    const rowH = plotH / midiSpan;
    const fontFamily = readCss(wrap, 'font-family', 'sans-serif');
    // Cap height is ~0.7em; size the C labels to sit inside one key with a little pad.
    const keyLabelPx = Math.max(7, rowH * 0.9);

    // Integer MIDI sits at the centre of that key (in-tune = middle of the lane).
    const yOf = (midi: number) =>
      plotH - ((midi - midiLo + 0.5) / midiSpan) * plotH;

    // Note lanes.
    for (let m = midiLo; m < midiHi; ++m) {
      const pc = ((m % 12) + 12) % 12;
      const y = yOf(m + 0.5);
      ctx.fillStyle = isBlack(pc) ? laneBlack : laneWhite;
      ctx.fillRect(keyW, y, plotW, rowH);
      if (!notes[pc]) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(keyW, y, plotW, rowH);
      }
    }

    // Keyboard.
    for (let m = midiLo; m < midiHi; ++m) {
      const pc = ((m % 12) + 12) % 12;
      const y = yOf(m + 0.5);
      const allowed = notes[pc];
      if (isBlack(pc)) {
        ctx.fillStyle = allowed ? keyBlackOn : keyBlackOff;
        ctx.fillRect(0, y, keyW, rowH);
      } else {
        ctx.fillStyle = allowed ? keyWhiteOn : keyWhiteOff;
        ctx.fillRect(0, y, keyW, rowH);
      }
      ctx.strokeStyle = lesser;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
      if (pc === 0) {
        ctx.fillStyle = isBlack(pc) ? least : '#333';
        ctx.font = `${keyLabelPx}px ${fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(`C${Math.floor(m / 12) - 1}`, 3, y + rowH * 0.6);
      }
    }

    // Adjacent white keys (E|F, B|C) need a dark join — the lane fill is the
    // same colour on both sides, so the usual lesser stroke disappears.
    ctx.strokeStyle = laneBlack;
    ctx.lineWidth = 1;
    for (let m = midiLo; m < midiHi; ++m) {
      const pc = ((m % 12) + 12) % 12;
      if (pc !== 4 && pc !== 11) continue;
      const y = yOf(m + 0.5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = lesser;
    if (stripH > 0) {
      ctx.beginPath();
      ctx.moveTo(keyW, plotH);
      ctx.lineTo(cssW, plotH);
      ctx.stroke();
    }

    const buf = pitchData;
    if (!buf || buf.length < HIST_CH + 1) {
      return;
    }

    let phase = 0;
    let data = buf;
    if (buf.length % HIST_CH === 1) {
      phase = buf[buf.length - 1] ?? 0;
      data = buf.subarray(0, buf.length - 1);
    }
    const slots = Math.floor(data.length / HIST_CH);
    if (slots < 2) return;

    const slotMs = PITCH_ROLL_MS / Math.max(1, slots - 1);
    const xOf = (i: number) => {
      const age =
        i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phase * slotMs;
      return keyW + plotW * (1 - age / PITCH_ROLL_MS);
    };

    // Pull amount / confidence strip (tuner).
    if (stripH > 0) {
      for (let i = 0; i < slots; ++i) {
        const corr =
          modeRef.current === 'octaver'
            ? (data[i * HIST_CH + 2] ?? 0) * 200
            : Math.abs(data[i * HIST_CH + 4] ?? 0);
        const x0 = xOf(i);
        const x1 = i + 1 < slots ? xOf(i + 1) : x0 + 1;
        const wSlot = Math.max(1, Math.abs(x1 - x0) + 0.5);
        ctx.fillStyle = corrFill(corr, accent, warn);
        ctx.fillRect(Math.min(x0, x1), plotH + 1, wSlot, stripH - 1);
      }
    }

    const strokePitch = (
      midiOf: (i: number) => number,
      style: string,
      width: number,
      dash: number[],
      voicedCheck: (flags: number) => boolean = (f) => (f & 1) !== 0,
    ) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < slots; ++i) {
        const midi = midiOf(i);
        const flags = data[i * HIST_CH + 3] ?? 0;
        if (!voicedCheck(flags) || !(midi > 12)) {
          started = false;
          continue;
        }
        const x = xOf(i);
        const y = yOf(midi);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (modeRef.current === 'octaver') {
      const inMidi = (i: number) => data[i * HIST_CH + 0] ?? 0;
      const bitsOf = (i: number) => Math.round(data[i * HIST_CH + 1] ?? 0);
      const mid = midAccentWarn(accent, warn);
      // Dry dashed --color; −1 mid(accent,warn); −2 warn; +1 --color; sub accent.
      strokePitch(
        (i) => ((bitsOf(i) & 1) ? inMidi(i) : 0),
        withAlpha(fg, 0.85),
        1.75,
        PITCH_DASH_TIGHT,
      );
      strokePitch(
        (i) => ((bitsOf(i) & 2) ? inMidi(i) - 12 : 0),
        mid,
        1.75,
        [],
      );
      strokePitch(
        (i) => ((bitsOf(i) & 4) ? inMidi(i) - 24 : 0),
        warn,
        1.75,
        [],
      );
      strokePitch(
        (i) => ((bitsOf(i) & 8) ? inMidi(i) + 12 : 0),
        fg,
        1.75,
        [],
      );
      strokePitch(
        (i) => ((bitsOf(i) & 16) ? inMidi(i) - 12 : 0),
        accent,
        1.75,
        [],
      );
      for (let i = 0; i < slots; ++i) {
        const flags = data[i * HIST_CH + 3] ?? 0;
        if ((flags & 4) === 0 || (flags & 1) === 0) continue;
        const midi = inMidi(i);
        if (!(midi > 12)) continue;
        ctx.fillStyle = warn;
        ctx.beginPath();
        ctx.arc(xOf(i), yOf(midi), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const inMidi = (i: number) => data[i * HIST_CH + 0] ?? 0;
      const tgtMidi = (i: number) => data[i * HIST_CH + 1] ?? 0;
      const outMidi = (i: number) =>
        inMidi(i) + (data[i * HIST_CH + 4] ?? 0) / 100;

      if (showTarg)
        strokePitch(tgtMidi, withAlpha(fg, 0.5), 1.75, PITCH_DASH_TIGHT);
      if (showIn) {
        strokePitch(inMidi, accent, 1.75, []);
        for (let i = 0; i < slots; ++i) {
          const flags = data[i * HIST_CH + 3] ?? 0;
          if ((flags & 4) === 0 || (flags & 1) === 0) continue;
          const midi = inMidi(i);
          if (!(midi > 12)) continue;
          ctx.fillStyle = warn;
          ctx.beginPath();
          ctx.arc(xOf(i), yOf(midi), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (showOut) strokePitch(outMidi, warn, 1.75, []);
    }

    ctx.fillStyle = fg;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(PITCH_ROLL_MS / 1000)}s`, cssW - 6, 12);
    ctx.textAlign = 'left';
  }, [
    pitchData,
    fmin,
    fmax,
    notes,
    showIn,
    showOut,
    showTarg,
    theme,
  ]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const bins = Math.max(
        48,
        Math.min(512, Math.round(wrap.clientWidth / 3)),
      );
      postToHost({ t: 'vizcfg', id: vizId, bins });
      paint();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [vizId, paint]);

  return (
    <div
      ref={wrapRef}
      className={['PitchRollChart', className].filter(Boolean).join(' ')}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export { NOTE_NAMES };
