import { DynamicValue } from '@deutschesoft/awml';
import { bindChannelCount, bindParamToHost, bindVizLevels, postBegin, postEnd } from '../bind_param';

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

/** Shared header I/O: channel count, meters, In/Out gain. */
export interface IHeaderIo {
  channelCount$: DynamicValue<number>;
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
 * Create header I/O state: `{t:"io",ch}` + In/Out gain params + `viz` streams.
 */
export function createHeaderIo(defaultChannels = 2): IHeaderIo {
  const ch0 = Math.max(1, Math.min(kMaxIoChannels, defaultChannels));
  const channelCount$ = DynamicValue.fromConstant(ch0);
  const levelIn$ = DynamicValue.fromConstant(silenceLevels(ch0));
  const levelOut$ = DynamicValue.fromConstant(silenceLevels(ch0));
  const inGain$ = DynamicValue.fromConstant(ioGainMeta.default);
  const outGain$ = DynamicValue.fromConstant(ioGainMeta.default);

  const unbindIo = bindChannelCount(channelCount$);
  const unbindVizIn = bindVizLevels(levelIn$, 'in');
  const unbindVizOut = bindVizLevels(levelOut$, 'out');
  const unbindIn = bindParamToHost(inGain$, kParamInGain);
  const unbindOut = bindParamToHost(outGain$, kParamOutGain);
  const unsubResize = channelCount$.subscribe((ch) => {
    const n = Math.max(1, Math.min(kMaxIoChannels, ch | 0));
    const curIn = levelIn$.value;
    const curOut = levelOut$.value;
    if (!Array.isArray(curIn) || curIn.length !== n)
      levelIn$.set(silenceLevels(n));
    if (!Array.isArray(curOut) || curOut.length !== n)
      levelOut$.set(silenceLevels(n));
  });

  return {
    channelCount$,
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
      unsubResize();
    },
  };
}
