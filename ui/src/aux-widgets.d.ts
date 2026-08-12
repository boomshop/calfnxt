declare module '@deutschesoft/aux-widgets/src/index.pure.js' {
  // AUX ships without TypeScript types; treat widgets as any-compatible constructors.
  export const Fader: new (...args: unknown[]) => unknown;
  export const Knob: new (...args: unknown[]) => unknown;
  export const ValueKnob: new (...args: unknown[]) => unknown;
  export const LevelMeter: new (...args: unknown[]) => unknown;
  export const Equalizer: new (...args: unknown[]) => unknown;
  export const EqBand: new (...args: unknown[]) => unknown;
  export const EqualizerGraph: new (...args: unknown[]) => unknown;
  export const Toggle: new (...args: unknown[]) => unknown;
  export const Select: new (...args: unknown[]) => unknown;
  export const Button: new (...args: unknown[]) => unknown;
  export const ConfirmButton: new (...args: unknown[]) => unknown;
  export const MultiMeter: new (...args: unknown[]) => unknown;
  export const Icon: new (...args: unknown[]) => unknown;
  export const PhaseMeter: new (...args: unknown[]) => unknown;
  export const Chart: new (...args: unknown[]) => unknown;
  export const ChartHandle: new (...args: unknown[]) => unknown;
  export const Compressor: new (...args: unknown[]) => unknown;
  export const Reverb: new (...args: unknown[]) => unknown;
}

declare module '@deutschesoft/aux-widgets/src/widgets/icon.js' {
  export const Icon: new (...args: unknown[]) => unknown;
}

declare module '@deutschesoft/aux-widgets/src/utils/biquad.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function biquadFilter(...trafos: any[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function lowPass2(O: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function highPass2(O: any): any;
}
