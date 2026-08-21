import { DynamicValue } from '@deutschesoft/awml';
import {
  bindIoChannelCounts,
  bindParamToHost,
  bindVizLevels,
  postBegin,
  postEnd,
} from '../bind_param';

export const kSilenceDb = -96;
export const kMaxIoChannels = 8;

/** Fixed VST ParamIDs — codegen always places these first. */
export const kParamInGain = 0;
export const kParamOutGain = 1;

export const ioGainMeta = {
  min: -60,
  max: 12,
  default: 0,
  unit: 'dB',
} as const;

export type ChannelLabels = string[];

/** Labels for common VST layouts (extend when more arrangements are accepted). */
export function labelsForChannelCount(ch: number): ChannelLabels {
  switch (ch) {
    case 1:
      return ['C'];
    case 2:
      return ['L', 'R'];
    default:
      return Array.from({ length: ch }, (_, i) => String(i + 1));
  }
}

function silenceLevels(ch: number): number[] {
  const n = Math.max(1, Math.min(kMaxIoChannels, ch | 0));
  return Array.from({ length: n }, () => kSilenceDb);
}

export type HeaderIoOptions =
  | number
  | {
      input?: number;
      output?: number;
    };

function resolveHeaderIoChannels(options: HeaderIoOptions): {
  input: number;
  output: number;
} {
  if (typeof options === 'number') {
    const n = Math.max(1, Math.min(kMaxIoChannels, options | 0));
    return { input: n, output: n };
  }
  return {
    input: Math.max(1, Math.min(kMaxIoChannels, options.input ?? 2)),
    output: Math.max(1, Math.min(kMaxIoChannels, options.output ?? 2)),
  };
}

/** Shared header I/O: channel count, meters, In/Out gain. */
export interface IHeaderIo {
  inputChannelCount$: DynamicValue<number>;
  outputChannelCount$: DynamicValue<number>;
  levelIn$: DynamicValue<number[]>;
  levelOut$: DynamicValue<number[]>;
  inGain$: DynamicValue<number>;
  outGain$: DynamicValue<number>;
  beginInGainEdit: () => void;
  endInGainEdit: () => void;
  beginOutGainEdit: () => void;
  endOutGainEdit: () => void;
  /** Unbind host listeners (call on unmount for owned models). */
  dispose: () => void;
}

/**
 * Create header I/O state: `{t:"io",ch,in,out}` + In/Out gain params + `viz` streams.
 */
export function createHeaderIo(options: HeaderIoOptions = 2): IHeaderIo {
  const { input: in0, output: out0 } = resolveHeaderIoChannels(options);
  const inputChannelCount$ = DynamicValue.fromConstant(in0);
  const outputChannelCount$ = DynamicValue.fromConstant(out0);
  const levelIn$ = DynamicValue.fromConstant(silenceLevels(in0));
  const levelOut$ = DynamicValue.fromConstant(silenceLevels(out0));
  const inGain$ = DynamicValue.fromConstant(ioGainMeta.default);
  const outGain$ = DynamicValue.fromConstant(ioGainMeta.default);

  const unbindIo = bindIoChannelCounts(inputChannelCount$, outputChannelCount$);
  const unbindVizIn = bindVizLevels(levelIn$, 'in');
  const unbindVizOut = bindVizLevels(levelOut$, 'out');
  const unbindIn = bindParamToHost(inGain$, kParamInGain);
  const unbindOut = bindParamToHost(outGain$, kParamOutGain);
  const unsubInResize = inputChannelCount$.subscribe((ch) => {
    const n = Math.max(1, Math.min(kMaxIoChannels, ch | 0));
    const curIn = levelIn$.value;
    if (!Array.isArray(curIn) || curIn.length !== n)
      levelIn$.set(silenceLevels(n));
  });
  const unsubOutResize = outputChannelCount$.subscribe((ch) => {
    const n = Math.max(1, Math.min(kMaxIoChannels, ch | 0));
    const curOut = levelOut$.value;
    if (!Array.isArray(curOut) || curOut.length !== n)
      levelOut$.set(silenceLevels(n));
  });

  return {
    inputChannelCount$,
    outputChannelCount$,
    levelIn$,
    levelOut$,
    inGain$,
    outGain$,
    beginInGainEdit: () => postBegin(kParamInGain),
    endInGainEdit: () => postEnd(kParamInGain),
    beginOutGainEdit: () => postBegin(kParamOutGain),
    endOutGainEdit: () => postEnd(kParamOutGain),
    dispose: () => {
      unbindIo();
      unbindVizIn();
      unbindVizOut();
      unbindIn();
      unbindOut();
      unsubInResize();
      unsubOutResize();
    },
  };
}
