import { useCallback, useEffect, useRef } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { postToHost } from '../../bridge';
import { themeColors$ } from '../../theme/themeColors';
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
  } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef(data$.value);
  const fminRef = useRef(fmin$.value);
  const fmaxRef = useRef(fmax$.value);
  const notesRef = useRef<boolean[]>(notes$.map((d) => d.value));
  const showInRef = useRef(showIn$?.value ?? true);
  const showTargRef = useRef(showTarg$?.value ?? true);
  const showOutRef = useRef(showOut$?.value ?? true);

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
    const stripH = 8;
    const plotW = Math.max(1, cssW - keyW);
    const plotH = Math.max(1, cssH - stripH);
    const midiLo = Math.max(12, Math.floor(midiFromHz(fminRef.current)) - 2);
    const midiHi = Math.min(108, Math.ceil(midiFromHz(fmaxRef.current)) + 2);
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
      if (!notesRef.current[pc]) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(keyW, y, plotW, rowH);
      }
    }

    // Keyboard.
    for (let m = midiLo; m < midiHi; ++m) {
      const pc = ((m % 12) + 12) % 12;
      const y = yOf(m + 0.5);
      const allowed = notesRef.current[pc];
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
    ctx.beginPath();
    ctx.moveTo(keyW, plotH);
    ctx.lineTo(cssW, plotH);
    ctx.stroke();

    const buf = dataRef.current;
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

    // Pull amount: black (0) → accent (100 ct) → warn (200 ct) → white (400 ct).
    for (let i = 0; i < slots; ++i) {
      const corr = Math.abs(data[i * HIST_CH + 4] ?? 0);
      const x0 = xOf(i);
      const x1 = i + 1 < slots ? xOf(i + 1) : x0 + 1;
      const wSlot = Math.max(1, Math.abs(x1 - x0) + 0.5);
      ctx.fillStyle = corrFill(corr, accent, warn);
      ctx.fillRect(Math.min(x0, x1), plotH + 1, wSlot, stripH - 1);
    }

    const strokePitch = (
      midiOf: (i: number) => number,
      style: string,
      width: number,
      dash: number[],
    ) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < slots; ++i) {
        const midi = midiOf(i);
        const flags = data[i * HIST_CH + 3] ?? 0;
        const voiced = (flags & 1) !== 0;
        if (!voiced || !(midi > 12)) {
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

    const inMidi = (i: number) => data[i * HIST_CH + 0] ?? 0;
    const tgtMidi = (i: number) => data[i * HIST_CH + 1] ?? 0;
    const outMidi = (i: number) =>
      inMidi(i) + (data[i * HIST_CH + 4] ?? 0) / 100;

    if (showTargRef.current)
      strokePitch(tgtMidi, withAlpha(fg, 0.5), 1.5, [4, 3]);
    if (showInRef.current) {
      strokePitch(inMidi, accent, 1.8, []);
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
    if (showOutRef.current) strokePitch(outMidi, warn, 1.6, []);

    ctx.fillStyle = fg;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('10s', cssW - 6, 12);
    ctx.textAlign = 'left';
  }, []);

  useEffect(() => {
    const u1 = data$.subscribe((v) => {
      dataRef.current = v;
      paint();
    });
    const u2 = fmin$.subscribe((v) => {
      fminRef.current = v;
      paint();
    });
    const u3 = fmax$.subscribe((v) => {
      fmaxRef.current = v;
      paint();
    });
    const uTheme = themeColors$.subscribe(() => paint());
    paint();
    return () => {
      u1();
      u2();
      u3();
      uTheme();
    };
  }, [data$, fmin$, fmax$, paint]);

  useEffect(() => {
    showInRef.current = showIn$?.value ?? true;
    showTargRef.current = showTarg$?.value ?? true;
    showOutRef.current = showOut$?.value ?? true;
    const uIn = showIn$?.subscribe((v) => {
      showInRef.current = v;
      paint();
    });
    const uTarg = showTarg$?.subscribe((v) => {
      showTargRef.current = v;
      paint();
    });
    const uOut = showOut$?.subscribe((v) => {
      showOutRef.current = v;
      paint();
    });
    paint();
    return () => {
      uIn?.();
      uTarg?.();
      uOut?.();
    };
  }, [showIn$, showTarg$, showOut$, paint]);

  useEffect(() => {
    const unsubs = notes$.map((dv, i) =>
      dv.subscribe((v) => {
        const next = notesRef.current.slice();
        next[i] = v;
        notesRef.current = next;
        paint();
      }),
    );
    notesRef.current = notes$.map((d) => d.value);
    paint();
    return () => {
      for (const u of unsubs) u();
    };
  }, [notes$, paint]);

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
