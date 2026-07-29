import { DynamicValue } from '@deutschesoft/awml';
import {
  EQ_DRAW_SAMPLE_RATE,
  auxBandPass,
  auxHighShelf,
  auxHighpass12,
  auxHighpass24,
  auxHighpass36,
  auxLowShelf,
  auxLowpass12,
  auxLowpass24,
  auxLowpass36,
  auxPeaking,
} from '../dsp/eqFilters';
import {
  EQ_BAND_COUNT,
  EQ_BAND_OFFSET,
  bandParamId,
  paramIds,
  pluginMeta,
} from '../generated/equalizerModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizGains,
  postBegin,
  postEnd,
} from '../bind_param';

/** UI / Select filter type ids (numeric = VST plain type param). */
export type EqFilterType =
  | 'parametric'
  | 'lowshelf'
  | 'highshelf'
  | 'lowpass'
  | 'highpass'
  | 'bandpass';

export const EQ_TYPE_TO_INDEX: Record<EqFilterType, number> = {
  parametric: 0,
  lowshelf: 1,
  highshelf: 2,
  lowpass: 3,
  highpass: 4,
  bandpass: 5,
};

export const EQ_INDEX_TO_TYPE: EqFilterType[] = [
  'parametric',
  'lowshelf',
  'highshelf',
  'lowpass',
  'highpass',
  'bandpass',
];

/** Pass-filter slope in dB/oct (maps to cascaded RBJ stages, matching DSP). */
export type EqPassSlope = 12 | 24 | 36;

/** ChartHandle mode per UI filter type. */
export const EQ_FILTER_MODES: Record<EqFilterType, string> = {
  parametric: 'circular',
  lowshelf: 'line-vertical',
  highshelf: 'line-vertical',
  lowpass: 'block-right',
  highpass: 'block-left',
  bandpass: 'line-vertical',
};

export type AuxEqType = string | ((O: unknown) => unknown);

/** AUX EqBand type factories — same RBJ math as `common/dsp/biquad.h`. */
export function toAuxEqType(
  type: EqFilterType,
  slope: EqPassSlope = 12,
): AuxEqType {
  switch (type) {
    case 'parametric':
      return auxPeaking;
    case 'lowshelf':
      return auxLowShelf;
    case 'highshelf':
      return auxHighShelf;
    case 'bandpass':
      return auxBandPass;
    case 'lowpass':
      if (slope === 24) return auxLowpass24;
      if (slope === 36) return auxLowpass36;
      return auxLowpass12;
    case 'highpass':
      if (slope === 24) return auxHighpass24;
      if (slope === 36) return auxHighpass36;
      return auxHighpass12;
  }
}

export { EQ_DRAW_SAMPLE_RATE };

export function isPassFilter(type: EqFilterType): boolean {
  return type === 'lowpass' || type === 'highpass';
}

/** DynEQ applies to types that use filter gain (not LP/HP). */
export function bandSupportsDyn(type: EqFilterType): boolean {
  return (
    type === 'parametric' ||
    type === 'lowshelf' ||
    type === 'highshelf' ||
    type === 'bandpass'
  );
}

export const EQ_FILTER_TYPE_ENTRIES: {
  label: string;
  value: EqFilterType;
  icon: EqFilterType;
}[] = [
  { label: 'Parametric', value: 'parametric', icon: 'parametric' },
  { label: 'Low Shelf', value: 'lowshelf', icon: 'lowshelf' },
  { label: 'High Shelf', value: 'highshelf', icon: 'highshelf' },
  { label: 'Low Pass', value: 'lowpass', icon: 'lowpass' },
  { label: 'High Pass', value: 'highpass', icon: 'highpass' },
  { label: 'Band Pass', value: 'bandpass', icon: 'bandpass' },
];

export const EQ_PASS_SLOPE_ENTRIES: { label: string; value: EqPassSlope }[] = [
  { label: '12 dB', value: 12 },
  { label: '24 dB', value: 24 },
  { label: '36 dB', value: 36 },
];

export const EQ_MAX_BANDS = EQ_BAND_COUNT;
export const EQ_FREQ_MIN = 20;
export const EQ_FREQ_MAX = 20000;
export const EQ_GAIN_MIN = -24;
export const EQ_GAIN_MAX = 24;
export const EQ_Q_MIN = 0.1;
export const EQ_Q_MAX = 20;
export const EQ_DYN_ATTACK_MIN = 0.1;
export const EQ_DYN_ATTACK_MAX = 500;
export const EQ_DYN_RELEASE_MIN = 1;
export const EQ_DYN_RELEASE_MAX = 2000;
export const EQ_DYN_THRESH_MIN = -60;
export const EQ_DYN_THRESH_MAX = 0;
export const EQ_DYN_RATIO_MIN = 1;
export const EQ_DYN_RATIO_MAX = 20;

/** Default selection: band 9 (0-based index 8). */
export const EQ_DEFAULT_SELECTED_INDEX = 0;

export interface IEqualizerBand {
  /** Stable slot index 0…15 */
  index: number;
  id: string;
  gain$: DynamicValue<number>;
  /** DSP-applied gain for curves (static or dyn); from viz, mirrored from gain$ in dev. */
  effectiveGain$: DynamicValue<number>;
  frequency$: DynamicValue<number>;
  q$: DynamicValue<number>;
  type$: DynamicValue<EqFilterType>;
  slope$: DynamicValue<EqPassSlope>;
  auxType$: DynamicValue<AuxEqType>;
  active$: DynamicValue<boolean>;
  dyn$: DynamicValue<boolean>;
  dynAttack$: DynamicValue<number>;
  dynRelease$: DynamicValue<number>;
  dynThreshold$: DynamicValue<number>;
  dynRatio$: DynamicValue<number>;
  /** Solo detector / sidechain into the plugin output. */
  listen$: DynamicValue<boolean>;
  /** DSP descriptor defaults for AUX Knob double-click reset. */
  defaults: {
    frequency: number;
    gain: number;
    q: number;
    dynAttack: number;
    dynRelease: number;
    dynThreshold: number;
    dynRatio: number;
  };
}

function snapSlope(v: number): EqPassSlope {
  if (v >= 30) return 36;
  if (v >= 18) return 24;
  return 12;
}

function typeFromPlain(v: number): EqFilterType {
  const i = Math.round(Math.min(5, Math.max(0, v)));
  return EQ_INDEX_TO_TYPE[i] ?? 'parametric';
}

/** Safe Q when entering a filter type for the first time. */
export function defaultQForType(type: EqFilterType): number {
  switch (type) {
    case 'parametric':
    case 'bandpass':
      return 1;
    default:
      return 0.707;
  }
}

type TypeMemory = {
  gain: number;
  q: number;
  slope: EqPassSlope;
};

function defaultTypeMemory(type: EqFilterType): TypeMemory {
  return { gain: 0, q: defaultQForType(type), slope: 12 };
}

/**
 * Bind type param with per-type gain/Q/slope memory on UI switches.
 * Host/preset type changes do not rewrite sibling params (they arrive separately).
 */
function bindTypeParam(
  type$: DynamicValue<EqFilterType>,
  gain$: DynamicValue<number>,
  q$: DynamicValue<number>,
  slope$: DynamicValue<EqPassSlope>,
  id: number,
): () => void {
  let fromHost = false;
  let prevType = type$.value;
  const memory = new Map<EqFilterType, TypeMemory>([
    [prevType, { gain: gain$.value, q: q$.value, slope: slope$.value }],
  ]);

  const bridge = DynamicValue.fromConstant(EQ_TYPE_TO_INDEX[type$.value]);
  const unsubUi = type$.subscribe((t) => {
    const n = EQ_TYPE_TO_INDEX[t];
    if (bridge.value !== n) bridge.set(n);
    if (fromHost) {
      prevType = t;
      return;
    }
    if (t === prevType) return;

    memory.set(prevType, {
      gain: gain$.value,
      q: q$.value,
      slope: slope$.value,
    });
    prevType = t;

    const next = memory.get(t) ?? defaultTypeMemory(t);
    if (gain$.value !== next.gain) gain$.set(next.gain);
    if (q$.value !== next.q) q$.set(next.q);
    if (slope$.value !== next.slope) slope$.set(next.slope);
  }, false);
  const unsubBr = bridge.subscribe((n) => {
    const t = typeFromPlain(n);
    if (type$.value === t) return;
    fromHost = true;
    try {
      type$.set(t);
    } finally {
      fromHost = false;
    }
  }, false);
  const unbind = bindParamToHost(bridge, id);
  return () => {
    unsubUi();
    unsubBr();
    unbind();
  };
}

function bindSlopeParam(
  slope$: DynamicValue<EqPassSlope>,
  id: number,
): () => void {
  const bridge = DynamicValue.fromConstant(slope$.value as number);
  const unsubUi = slope$.subscribe((s) => {
    if (bridge.value !== s) bridge.set(s);
  }, false);
  const unsubBr = bridge.subscribe((n) => {
    const s = snapSlope(n);
    if (slope$.value !== s) slope$.set(s);
  }, false);
  const unbind = bindParamToHost(bridge, id);
  return () => {
    unsubUi();
    unsubBr();
    unbind();
  };
}

function paramDefault(id: number, fallback: number): number {
  const meta = pluginMeta.parameters[id];
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function createBoundEqualizerBands(): {
  bands: IEqualizerBand[];
  dispose: () => void;
} {
  const disposers: Array<() => void> = [];
  const bands: IEqualizerBand[] = [];

  for (let i = 0; i < EQ_BAND_COUNT; ++i) {
    const typePlain = paramDefault(bandParamId(i, EQ_BAND_OFFSET.type), 0);
    const seedType = typeFromPlain(typePlain);
    const slopePlain = paramDefault(bandParamId(i, EQ_BAND_OFFSET.slope), 12);

    const type$ = DynamicValue.fromConstant<EqFilterType>(seedType);
    const slope$ = DynamicValue.fromConstant<EqPassSlope>(
      snapSlope(slopePlain),
    );
    const auxType$ = DynamicValue.fromConstant(
      toAuxEqType(type$.value, slope$.value),
    );
    const syncAux = () => {
      auxType$.set(toAuxEqType(type$.value, slope$.value));
    };
    type$.subscribe(syncAux, false);
    slope$.subscribe(syncAux, false);

    const gainDefault = paramDefault(bandParamId(i, EQ_BAND_OFFSET.gain), 0);
    const freqDefault = paramDefault(bandParamId(i, EQ_BAND_OFFSET.freq), 1000);
    const qDefault = paramDefault(bandParamId(i, EQ_BAND_OFFSET.q), 0.707);
    const dynAttackDefault = paramDefault(
      bandParamId(i, EQ_BAND_OFFSET.dyn_attack),
      20,
    );
    const dynReleaseDefault = paramDefault(
      bandParamId(i, EQ_BAND_OFFSET.dyn_release),
      200,
    );
    const dynThresholdDefault = paramDefault(
      bandParamId(i, EQ_BAND_OFFSET.dyn_threshold),
      -36,
    );
    const dynRatioDefault = paramDefault(
      bandParamId(i, EQ_BAND_OFFSET.dyn_ratio),
      2,
    );

    const gain$ = DynamicValue.fromConstant(gainDefault);
    const effectiveGain$ = DynamicValue.fromConstant(gain$.value);
    const frequency$ = DynamicValue.fromConstant(freqDefault);
    const q$ = DynamicValue.fromConstant(qDefault);
    const active$ = DynamicValue.fromConstant(
      paramDefault(bandParamId(i, EQ_BAND_OFFSET.active), 0) >= 0.5,
    );
    const dyn$ = DynamicValue.fromConstant(
      paramDefault(bandParamId(i, EQ_BAND_OFFSET.dyn), 0) >= 0.5,
    );
    // Dev only: mirror static gain → curve while dyn is off / unsupported / inactive.
    // When dyn is on and active, effectiveGain$ is viz-only (never write handle dB into curves).
    disposers.push(
      gain$.subscribe((v) => {
        if (!active$.value || !dyn$.value || !bandSupportsDyn(type$.value))
          effectiveGain$.set(v);
      }, false),
    );
    const syncStaticCurve = () => {
      if (!active$.value || !dyn$.value || !bandSupportsDyn(type$.value))
        effectiveGain$.set(gain$.value);
    };
    disposers.push(dyn$.subscribe(() => syncStaticCurve(), false));
    disposers.push(active$.subscribe(() => syncStaticCurve(), false));
    disposers.push(type$.subscribe(() => syncStaticCurve(), false));
    const dynAttack$ = DynamicValue.fromConstant(dynAttackDefault);
    const dynRelease$ = DynamicValue.fromConstant(dynReleaseDefault);
    const dynThreshold$ = DynamicValue.fromConstant(dynThresholdDefault);
    const dynRatio$ = DynamicValue.fromConstant(dynRatioDefault);
    const listen$ = DynamicValue.fromConstant(
      paramDefault(bandParamId(i, EQ_BAND_OFFSET.dyn_listen), 0) >= 0.5,
    );

    disposers.push(
      bindBoolParamToHost(active$, bandParamId(i, EQ_BAND_OFFSET.active)),
    );
    disposers.push(
      bindTypeParam(
        type$,
        gain$,
        q$,
        slope$,
        bandParamId(i, EQ_BAND_OFFSET.type),
      ),
    );
    disposers.push(
      bindSlopeParam(slope$, bandParamId(i, EQ_BAND_OFFSET.slope)),
    );
    disposers.push(
      bindParamToHost(frequency$, bandParamId(i, EQ_BAND_OFFSET.freq)),
    );
    disposers.push(bindParamToHost(gain$, bandParamId(i, EQ_BAND_OFFSET.gain)));
    disposers.push(bindParamToHost(q$, bandParamId(i, EQ_BAND_OFFSET.q)));
    disposers.push(
      bindBoolParamToHost(dyn$, bandParamId(i, EQ_BAND_OFFSET.dyn)),
    );
    disposers.push(
      bindParamToHost(dynAttack$, bandParamId(i, EQ_BAND_OFFSET.dyn_attack)),
    );
    disposers.push(
      bindParamToHost(dynRelease$, bandParamId(i, EQ_BAND_OFFSET.dyn_release)),
    );
    disposers.push(
      bindParamToHost(
        dynThreshold$,
        bandParamId(i, EQ_BAND_OFFSET.dyn_threshold),
      ),
    );
    disposers.push(
      bindParamToHost(dynRatio$, bandParamId(i, EQ_BAND_OFFSET.dyn_ratio)),
    );
    disposers.push(
      bindBoolParamToHost(listen$, bandParamId(i, EQ_BAND_OFFSET.dyn_listen)),
    );

    bands.push({
      index: i,
      id: `b${String(i + 1).padStart(2, '0')}`,
      gain$,
      effectiveGain$,
      frequency$,
      q$,
      type$,
      slope$,
      auxType$,
      active$,
      dyn$,
      dynAttack$,
      dynRelease$,
      dynThreshold$,
      dynRatio$,
      listen$,
      defaults: {
        frequency: freqDefault,
        gain: gainDefault,
        q: qDefault,
        dynAttack: dynAttackDefault,
        dynRelease: dynReleaseDefault,
        dynThreshold: dynThresholdDefault,
        dynRatio: dynRatioDefault,
      },
    });
  }

  // Only one listen solo at a time.
  for (const band of bands) {
    disposers.push(
      band.listen$.subscribe((on) => {
        if (!on) return;
        for (const other of bands) {
          if (other.id !== band.id && other.listen$.value)
            other.listen$.set(false);
        }
      }, false),
    );
  }

  // DSP viz owns curve gains only while a band is actively doing DynEQ.
  // Otherwise curves follow the static gain knob (avoids stale GR in graphs).
  const gainsBuf$ = DynamicValue.fromConstant<number[]>(
    bands.map((b) => b.effectiveGain$.value),
  );
  disposers.push(
    gainsBuf$.subscribe((arr) => {
      for (let i = 0; i < bands.length && i < arr.length; ++i) {
        const band = bands[i];
        const g = arr[i];
        if (typeof g !== 'number' || !Number.isFinite(g)) continue;
        if (
          band.active$.value &&
          band.dyn$.value &&
          bandSupportsDyn(band.type$.value)
        )
          band.effectiveGain$.set(g);
        else band.effectiveGain$.set(band.gain$.value);
      }
    }, false),
  );
  disposers.push(bindVizGains(gainsBuf$, 'eq'));

  return {
    bands,
    dispose: () => disposers.forEach((d) => d()),
  };
}

export interface IEqualizerHost {
  bypass$: DynamicValue<boolean>;
  bands: IEqualizerBand[];
  beginBypassEdit: () => void;
  endBypassEdit: () => void;
  dispose: () => void;
}

export function createBoundEqualizerHost(): IEqualizerHost {
  const bypass$ = DynamicValue.fromConstant(false);
  const unbindBypass = bindBoolParamToHost(bypass$, paramIds.bypass);
  const { bands, dispose: disposeBands } = createBoundEqualizerBands();
  return {
    bypass$,
    bands,
    beginBypassEdit: () => postBegin(paramIds.bypass),
    endBypassEdit: () => postEnd(paramIds.bypass),
    dispose: () => {
      unbindBypass();
      disposeBands();
    },
  };
}
