import { DynamicValue } from '@deutschesoft/awml';
import {
  EQ_BAND_COUNT as MB_BAND_COUNT,
  EQ_BAND_OFFSET as MB_BAND_OFFSET,
  bandParamId,
  paramIds,
  pluginMeta,
} from '../generated/mblimiterModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizBandIo,
  bindVizEnvelope,
  bindVizGrArray,
  postBegin,
  postEnd,
} from '../bind_param';
import { createHeaderIo, type IHeaderIo } from './headerMeters';
import { LIMITER_CURVE_ENTRIES } from './limiterHost';

export { LIMITER_CURVE_ENTRIES };

export const MBLIMITER_MAX_BANDS = MB_BAND_COUNT;
export const MBLIMITER_MIN_BANDS = 2;
export const MBLIMITER_XOVER_COUNT = MB_BAND_COUNT - 1;
export const MBLIMITER_FREQ_MIN = 20;
export const MBLIMITER_FREQ_MAX = 20000;
/** History channels per band: full-range peak, band peak, GR (linear). */
const MBLIMITER_HIST_CHANNELS = 3;
const MBLIMITER_VIZ_ID = 'mblimiter';

export const MBLIMITER_SLOPE_ENTRIES: { label: string; value: number }[] = [
  { label: '24 dB', value: 24 },
  { label: '48 dB', value: 48 },
  { label: '96 dB', value: 96 },
];

export type MblimiterBandParam = keyof typeof MB_BAND_OFFSET;

export interface IMblimiterBand {
  /** Slot index 0…5 (stable, independent of the active band count). */
  index: number;
  id: string;
  listen$: DynamicValue<boolean>;
  weight$: DynamicValue<number>;
  release$: DynamicValue<number>;
  /** Gain reduction amount in dB (0 = none). */
  gr$: DynamicValue<number>;
  /** Band level after the crossover split, in dB. */
  inLevel$: DynamicValue<number>;
  /** Band level after limiting, in dB. */
  outLevel$: DynamicValue<number>;
  /** This band's slice of the packed history buffer (3 channels + phase). */
  historyData$: DynamicValue<Float32Array | null>;
  /** DSP descriptor defaults for AUX Knob double-click reset. */
  defaults: Record<MblimiterBandParam, number>;
  paramId: (key: MblimiterBandParam) => number;
  beginEdit: (key: MblimiterBandParam) => void;
  endEdit: (key: MblimiterBandParam) => void;
}

export interface IMblimiterHost {
  meta: typeof pluginMeta;
  io: IHeaderIo;
  bypass$: DynamicValue<boolean>;
  mono$: DynamicValue<boolean>;
  diffListen$: DynamicValue<boolean>;
  numBands$: DynamicValue<number>;
  slope$: DynamicValue<number>;
  xover$: DynamicValue<number>[];
  limit$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  release$: DynamicValue<number>;
  minRelease$: DynamicValue<boolean>;
  asc$: DynamicValue<boolean>;
  ascCoeff$: DynamicValue<number>;
  oversampling$: DynamicValue<number>;
  autoLevel$: DynamicValue<boolean>;
  curve$: DynamicValue<number>;
  knee$: DynamicValue<number>;
  colorEnable$: DynamicValue<boolean>;
  color$: DynamicValue<number>;
  truePeak$: DynamicValue<boolean>;
  margin$: DynamicValue<number>;
  holdEnable$: DynamicValue<boolean>;
  releaseHold$: DynamicValue<number>;
  emphasisEnable$: DynamicValue<boolean>;
  emphasis$: DynamicValue<number>;
  bands: IMblimiterBand[];
  /** Gain reduction amounts (dB) for all active bands (+ optional master). */
  grAll$: DynamicValue<number[]>;
  /** Overall deepest GR (strip×broadband) with DSP fall ballistics. */
  gr$: DynamicValue<number>;
  /** Interleaved band levels [in0, out0, in1, out1, …] in dB. */
  bandIo$: DynamicValue<number[]>;
  /** Packed per-band history from DSP viz (split into band slices). */
  historyAll$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  dispose: () => void;
}

function paramDefault(id: number, fallback: number): number {
  const meta = pluginMeta.parameters[id];
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

function globalDefault(name: keyof typeof paramIds, fallback: number): number {
  return paramDefault(paramIds[name], fallback);
}

/** DSP descriptor default (plain) for AUX Knob double-click reset. */
export function mblimiterParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return globalDefault(name, fallback);
}

function clampFreq(v: number): number {
  if (!Number.isFinite(v)) return MBLIMITER_FREQ_MIN;
  return Math.min(MBLIMITER_FREQ_MAX, Math.max(MBLIMITER_FREQ_MIN, v));
}

function clampBands(v: number): number {
  const n = Math.round(v);
  if (!Number.isFinite(n)) return MBLIMITER_MIN_BANDS;
  return Math.min(MBLIMITER_MAX_BANDS, Math.max(MBLIMITER_MIN_BANDS, n));
}

function createBand(
  index: number,
  disposers: Array<() => void>,
): IMblimiterBand {
  const paramId = (key: MblimiterBandParam) =>
    bandParamId(index, MB_BAND_OFFSET[key]);
  const def = (key: MblimiterBandParam, fallback: number) =>
    paramDefault(paramId(key), fallback);

  const defaults: Record<MblimiterBandParam, number> = {
    listen: def('listen', 0),
    weight: def('weight', 0),
    release: def('release', 0),
  };

  const bindNum = (key: MblimiterBandParam) => {
    const dv = DynamicValue.fromConstant(defaults[key]);
    disposers.push(bindParamToHost(dv, paramId(key)));
    return dv;
  };
  const bindBool = (key: MblimiterBandParam) => {
    const dv = DynamicValue.fromConstant(defaults[key] >= 0.5);
    disposers.push(bindBoolParamToHost(dv, paramId(key)));
    return dv;
  };

  return {
    index,
    id: `b${String(index + 1).padStart(2, '0')}`,
    listen$: bindBool('listen'),
    weight$: bindNum('weight'),
    release$: bindNum('release'),
    gr$: DynamicValue.fromConstant(0),
    inLevel$: DynamicValue.fromConstant(-96),
    outLevel$: DynamicValue.fromConstant(-96),
    historyData$: DynamicValue.fromConstant<Float32Array | null>(null),
    defaults,
    paramId,
    beginEdit: (key) => postBegin(paramId(key)),
    endEdit: (key) => postEnd(paramId(key)),
  };
}

export function createBoundMblimiterHost(): IMblimiterHost {
  const disposers: Array<() => void> = [];
  const io = createHeaderIo(2);
  disposers.push(io.dispose);

  const bindNum = (name: keyof typeof paramIds, fallback = 0) => {
    const dv = DynamicValue.fromConstant(globalDefault(name, fallback));
    disposers.push(bindParamToHost(dv, paramIds[name]));
    return dv;
  };
  const bindBool = (name: keyof typeof paramIds) => {
    const dv = DynamicValue.fromConstant(globalDefault(name, 0) >= 0.5);
    disposers.push(bindBoolParamToHost(dv, paramIds[name]));
    return dv;
  };

  const bypass$ = bindBool('bypass');
  const mono$ = bindBool('mono');
  const diffListen$ = bindBool('diff_listen');

  const numBands$ = DynamicValue.fromConstant(
    clampBands(globalDefault('num_bands', 4)),
  );
  disposers.push(bindParamToHost(numBands$, paramIds.num_bands));

  const slope$ = DynamicValue.fromConstant(globalDefault('slope', 48));
  disposers.push(bindParamToHost(slope$, paramIds.slope));

  const xoverIds = [
    paramIds.xover1,
    paramIds.xover2,
    paramIds.xover3,
    paramIds.xover4,
    paramIds.xover5,
  ];
  const xover$ = xoverIds.map((id, i) => {
    const dv = DynamicValue.fromConstant(
      clampFreq(paramDefault(id, 200 * Math.pow(4, i))),
    );
    disposers.push(bindParamToHost(dv, id));
    return dv;
  });

  const limit$ = bindNum('limit', 0);
  const attack$ = bindNum('attack', 5);
  const release$ = bindNum('release', 50);
  const minRelease$ = bindBool('min_release');
  const asc$ = bindBool('asc');
  const ascCoeff$ = bindNum('asc_coeff', 0.5);
  const oversampling$ = bindNum('oversampling', 1);
  const autoLevel$ = bindBool('auto_level');
  const curve$ = bindNum('curve', 0);
  const knee$ = bindNum('knee', 0);
  const colorEnable$ = bindBool('color_enable');
  const color$ = bindNum('color', 0.35);
  const truePeak$ = bindBool('true_peak');
  const margin$ = bindNum('margin', 0.1);
  const holdEnable$ = bindBool('hold_enable');
  const releaseHold$ = bindNum('release_hold', 25);
  const emphasisEnable$ = bindBool('emphasis_enable');
  const emphasis$ = bindNum('emphasis', 0.4);

  const bands = Array.from({ length: MBLIMITER_MAX_BANDS }, (_, i) =>
    createBand(i, disposers),
  );

  // Only one band may solo its own output at a time.
  for (const band of bands) {
    disposers.push(
      band.listen$.subscribe((on) => {
        if (!on) return;
        for (const other of bands) {
          if (other.index !== band.index && other.listen$.value)
            other.listen$.set(false);
        }
      }, false),
    );
  }

  // Growing the band count splits the top band: the new crossover lands on the
  // geometric center between the previous top crossover and 20 kHz.
  let prevBands = clampBands(numBands$.value);
  disposers.push(
    numBands$.subscribe((v) => {
      const next = clampBands(v);
      if (next > prevBands) {
        for (let i = prevBands - 1; i <= next - 2; ++i) {
          const dv = xover$[i];
          if (!dv) continue;
          const below =
            i === 0
              ? MBLIMITER_FREQ_MIN
              : (xover$[i - 1]?.value ?? MBLIMITER_FREQ_MIN);
          const target = clampFreq(Math.sqrt(below * MBLIMITER_FREQ_MAX));
          postBegin(xoverIds[i]!);
          dv.set(target);
          postEnd(xoverIds[i]!);
        }
      }
      prevBands = next;
    }, false),
  );

  const gr$ = DynamicValue.fromConstant(0);
  const grAll$ = DynamicValue.fromConstant<number[]>([]);
  disposers.push(
    grAll$.subscribe((arr) => {
      const active = clampBands(numBands$.value);
      for (const band of bands) {
        const v = arr[band.index];
        band.gr$.set(typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }
      // Last element: DSP overallMeter_ (deepest strip×bb with fall ballistics).
      if (arr.length === active + 1) {
        const overall = arr[active];
        gr$.set(
          typeof overall === 'number' && Number.isFinite(overall) ? overall : 0,
        );
      } else if (arr.length > 0) {
        const last = arr[arr.length - 1];
        gr$.set(typeof last === 'number' && Number.isFinite(last) ? last : 0);
      }
    }, false),
  );
  disposers.push(bindVizGrArray((v) => grAll$.set(v), MBLIMITER_VIZ_ID));

  const bandIo$ = DynamicValue.fromConstant<number[]>([]);
  disposers.push(
    bandIo$.subscribe((arr) => {
      for (const band of bands) {
        const inDb = arr[band.index * 2];
        const outDb = arr[band.index * 2 + 1];
        band.inLevel$.set(typeof inDb === 'number' ? inDb : -96);
        band.outLevel$.set(typeof outDb === 'number' ? outDb : -96);
      }
    }, false),
  );
  disposers.push(bindVizBandIo(bandIo$, MBLIMITER_VIZ_ID));

  const historyAll$ = DynamicValue.fromConstant<Float32Array | null>(null);
  disposers.push(
    historyAll$.subscribe((buf) => {
      const active = clampBands(numBands$.value);
      if (!buf || buf.length < active * MBLIMITER_HIST_CHANNELS + 1) {
        for (const band of bands) band.historyData$.set(null);
        return;
      }
      // Packed as bands × (slots × channels) plus one trailing shared phase.
      const phase = buf[buf.length - 1] ?? 0;
      const perBand = Math.floor((buf.length - 1) / active);
      for (const band of bands) {
        if (band.index >= active) {
          band.historyData$.set(null);
          continue;
        }
        const start = band.index * perBand;
        const slice = new Float32Array(perBand + 1);
        slice.set(buf.subarray(start, start + perBand));
        slice[perBand] = phase;
        band.historyData$.set(slice);
      }
    }, false),
  );
  disposers.push(bindVizEnvelope(historyAll$, MBLIMITER_VIZ_ID));

  return {
    meta: pluginMeta,
    io,
    bypass$,
    mono$,
    diffListen$,
    numBands$,
    slope$,
    xover$,
    limit$,
    attack$,
    release$,
    minRelease$,
    asc$,
    ascCoeff$,
    oversampling$,
    autoLevel$,
    curve$,
    knee$,
    colorEnable$,
    color$,
    truePeak$,
    margin$,
    holdEnable$,
    releaseHold$,
    emphasisEnable$,
    emphasis$,
    bands,
    grAll$,
    gr$,
    bandIo$,
    historyAll$,
    beginEdit: postBegin,
    endEdit: postEnd,
    dispose: () => disposers.forEach((d) => d()),
  };
}
