import { DynamicValue } from '@deutschesoft/awml';
import {
  EQ_BAND_COUNT as MB_BAND_COUNT,
  EQ_BAND_OFFSET as MB_BAND_OFFSET,
  bandParamId,
  paramIds,
  pluginMeta,
} from '../generated/mbcompModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizBandIo,
  bindVizGrArray,
  bindVizEnvelope,
  bindVizPoint,
  postBegin,
  postEnd,
} from '../bind_param';
import { createHeaderIo, type IHeaderIo } from './headerMeters';
import {
  COMPRESSOR_LINK_ENTRIES,
  COMPRESSOR_MODE_ENTRIES,
} from './compressorHost';

/** Detector / stereo-link choices are shared with the single-band Compressor. */
export const MBCOMP_MODE_ENTRIES = COMPRESSOR_MODE_ENTRIES;
export const MBCOMP_LINK_ENTRIES = COMPRESSOR_LINK_ENTRIES;

export const MBCOMP_MAX_BANDS = MB_BAND_COUNT;
export const MBCOMP_MIN_BANDS = 2;
export const MBCOMP_XOVER_COUNT = MB_BAND_COUNT - 1;
export const MBCOMP_FREQ_MIN = 20;
export const MBCOMP_FREQ_MAX = 20000;
/** History channels per band: full-range peak, band peak, GR (linear). */
const MBCOMP_HIST_CHANNELS = 3;
const MBCOMP_VIZ_ID = 'mbcomp';

export const MBCOMP_SLOPE_ENTRIES: { label: string; value: number }[] = [
  { label: '24 dB', value: 24 },
  { label: '48 dB', value: 48 },
  { label: '96 dB', value: 96 },
];

export type MbcompBandParam = keyof typeof MB_BAND_OFFSET;

export interface IMbcompBand {
  /** Slot index 0…5 (stable, independent of the active band count). */
  index: number;
  id: string;
  active$: DynamicValue<boolean>;
  bypass$: DynamicValue<boolean>;
  listen$: DynamicValue<boolean>;
  threshold$: DynamicValue<number>;
  ratio$: DynamicValue<number>;
  knee$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  release$: DynamicValue<number>;
  makeup$: DynamicValue<number>;
  mix$: DynamicValue<number>;
  mode$: DynamicValue<number>;
  link$: DynamicValue<number>;
  pdr$: DynamicValue<number>;
  /** Gain reduction amount in dB (0 = none, up to 60). */
  gr$: DynamicValue<number>;
  /** Band level after the crossover split, in dB. */
  inLevel$: DynamicValue<number>;
  /** Band level after compression + makeup, in dB. */
  outLevel$: DynamicValue<number>;
  /** This band's slice of the packed history buffer (3 channels + phase). */
  historyData$: DynamicValue<Float32Array | null>;
  /** DSP descriptor defaults for AUX Knob double-click reset. */
  defaults: Record<MbcompBandParam, number>;
  paramId: (key: MbcompBandParam) => number;
  beginEdit: (key: MbcompBandParam) => void;
  endEdit: (key: MbcompBandParam) => void;
}

export interface IMbcompHost {
  meta: typeof pluginMeta;
  io: IHeaderIo;
  bypass$: DynamicValue<boolean>;
  mono$: DynamicValue<boolean>;
  numBands$: DynamicValue<number>;
  slope$: DynamicValue<number>;
  xover$: DynamicValue<number>[];
  bands: IMbcompBand[];
  /** UI-only detail panel selection (not a VST parameter). */
  selectedBandIndex$: DynamicValue<number>;
  /** Gain reduction amounts (dB) for all active bands. */
  grAll$: DynamicValue<number[]>;
  /** Interleaved band levels [in0, out0, in1, out1, …] in dB. */
  bandIo$: DynamicValue<number[]>;
  /** Packed per-band history from DSP viz (split into band slices). */
  historyAll$: DynamicValue<Float32Array | null>;
  /** Transfer operating point [inDb, outDb] of the listened / first band. */
  point$: DynamicValue<number[]>;
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
export function mbcompParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return globalDefault(name, fallback);
}

function clampFreq(v: number): number {
  if (!Number.isFinite(v)) return MBCOMP_FREQ_MIN;
  return Math.min(MBCOMP_FREQ_MAX, Math.max(MBCOMP_FREQ_MIN, v));
}

function clampBands(v: number): number {
  const n = Math.round(v);
  if (!Number.isFinite(n)) return MBCOMP_MIN_BANDS;
  return Math.min(MBCOMP_MAX_BANDS, Math.max(MBCOMP_MIN_BANDS, n));
}

function createBand(index: number, disposers: Array<() => void>): IMbcompBand {
  const paramId = (key: MbcompBandParam) =>
    bandParamId(index, MB_BAND_OFFSET[key]);
  const def = (key: MbcompBandParam, fallback: number) =>
    paramDefault(paramId(key), fallback);

  const defaults: Record<MbcompBandParam, number> = {
    active: def('active', 1),
    bypass: def('bypass', 0),
    listen: def('listen', 0),
    threshold: def('threshold', -20),
    ratio: def('ratio', 4),
    knee: def('knee', 6),
    attack: def('attack', 20),
    release: def('release', 200),
    makeup: def('makeup', 0),
    mix: def('mix', 1),
    mode: def('mode', 1),
    link: def('link', 0),
    pdr: def('pdr', 0),
  };

  const bindNum = (key: MbcompBandParam) => {
    const dv = DynamicValue.fromConstant(defaults[key]);
    disposers.push(bindParamToHost(dv, paramId(key)));
    return dv;
  };
  const bindBool = (key: MbcompBandParam) => {
    const dv = DynamicValue.fromConstant(defaults[key] >= 0.5);
    disposers.push(bindBoolParamToHost(dv, paramId(key)));
    return dv;
  };

  return {
    index,
    id: `b${String(index + 1).padStart(2, '0')}`,
    active$: bindBool('active'),
    bypass$: bindBool('bypass'),
    listen$: bindBool('listen'),
    threshold$: bindNum('threshold'),
    ratio$: bindNum('ratio'),
    knee$: bindNum('knee'),
    attack$: bindNum('attack'),
    release$: bindNum('release'),
    makeup$: bindNum('makeup'),
    mix$: bindNum('mix'),
    mode$: bindNum('mode'),
    link$: bindNum('link'),
    pdr$: bindNum('pdr'),
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

export function createBoundMbcompHost(): IMbcompHost {
  const disposers: Array<() => void> = [];
  const io = createHeaderIo(2);
  disposers.push(io.dispose);

  const bypass$ = DynamicValue.fromConstant(globalDefault('bypass', 0) >= 0.5);
  disposers.push(bindBoolParamToHost(bypass$, paramIds.bypass));

  const mono$ = DynamicValue.fromConstant(globalDefault('mono', 0) >= 0.5);
  disposers.push(bindBoolParamToHost(mono$, paramIds.mono));

  const numBands$ = DynamicValue.fromConstant(
    clampBands(globalDefault('num_bands', 4)),
  );
  disposers.push(bindParamToHost(numBands$, paramIds.num_bands));

  const slope$ = DynamicValue.fromConstant(globalDefault('slope', 24));
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

  const bands = Array.from({ length: MBCOMP_MAX_BANDS }, (_, i) =>
    createBand(i, disposers),
  );

  const selectedBandIndex$ = DynamicValue.fromConstant(0);

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
          const below = i === 0 ? MBCOMP_FREQ_MIN : (xover$[i - 1]?.value ?? MBCOMP_FREQ_MIN);
          const target = clampFreq(Math.sqrt(below * MBCOMP_FREQ_MAX));
          postBegin(xoverIds[i]!);
          dv.set(target);
          postEnd(xoverIds[i]!);
        }
      }
      if (selectedBandIndex$.value > next - 1) selectedBandIndex$.set(next - 1);
      prevBands = next;
    }, false),
  );

  const grAll$ = DynamicValue.fromConstant<number[]>([]);
  disposers.push(
    grAll$.subscribe((arr) => {
      for (const band of bands) {
        const v = arr[band.index];
        band.gr$.set(typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }
    }, false),
  );
  disposers.push(bindVizGrArray((v) => grAll$.set(v), MBCOMP_VIZ_ID));

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
  disposers.push(bindVizBandIo(bandIo$, MBCOMP_VIZ_ID));

  const historyAll$ = DynamicValue.fromConstant<Float32Array | null>(null);
  disposers.push(
    historyAll$.subscribe((buf) => {
      const active = clampBands(numBands$.value);
      if (!buf || buf.length < active * MBCOMP_HIST_CHANNELS + 1) {
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
  disposers.push(bindVizEnvelope(historyAll$, MBCOMP_VIZ_ID));

  const pointAll$ = DynamicValue.fromConstant<number[]>([]);
  const point$ = DynamicValue.fromConstant<number[]>([-96, -96]);
  const syncPoint = () => {
    const arr = pointAll$.value;
    const i = Math.max(0, Math.round(selectedBandIndex$.value)) * 2;
    const inDb = arr[i];
    const outDb = arr[i + 1];
    point$.set([
      typeof inDb === 'number' && Number.isFinite(inDb) ? inDb : -96,
      typeof outDb === 'number' && Number.isFinite(outDb) ? outDb : -96,
    ]);
  };
  disposers.push(bindVizPoint(pointAll$, MBCOMP_VIZ_ID));
  disposers.push(pointAll$.subscribe(syncPoint, false));
  disposers.push(selectedBandIndex$.subscribe(syncPoint, false));
  syncPoint();

  return {
    meta: pluginMeta,
    io,
    bypass$,
    mono$,
    numBands$,
    slope$,
    xover$,
    bands,
    selectedBandIndex$,
    grAll$,
    bandIo$,
    historyAll$,
    point$,
    beginEdit: postBegin,
    endEdit: postEnd,
    dispose: () => disposers.forEach((d) => d()),
  };
}
