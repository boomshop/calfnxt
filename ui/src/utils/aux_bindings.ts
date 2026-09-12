import type { DynamicValue } from '@deutschesoft/awml';
import { Bindings } from '@deutschesoft/awml/src/bindings.js';

/** AUX graph / handle / chart option target (enough for AWML Bindings). */
export type AuxBindable = {
  set: (name: string, value: unknown) => unknown;
  subscribe?: (event: string, cb: (...args: unknown[]) => void) => () => void;
  element?: Element | null;
};

/**
 * Binding desc for AUX options. `readonly` is supported by AWML runtime
 * (`createBinding`) but omitted from the published `.d.ts`.
 */
export type AuxBindingDescription = {
  name: string;
  backendValue: DynamicValue<any>;
  transformReceive?: (value: any) => any;
  transformSend?: (value: any) => any;
  readonly?: boolean;
  writeonly?: boolean;
  replayReceive?: boolean;
  replaySend?: boolean;
};

/**
 * Attach AWML Bindings to an AUX widget/graph.
 * Prefer this over `DynamicValue.subscribe` → `widget.set` for high-rate viz.
 */
export function bindAuxOptions(
  target: AuxBindable,
  descriptions: AuxBindingDescription[],
): Bindings {
  const sourceNode =
    (target.element as Node | null | undefined) ??
    (typeof document !== 'undefined' ? document.body : (null as unknown as Node));
  const bindings = new Bindings(
    target as never,
    sourceNode,
    null,
  );
  bindings.update(descriptions as never);
  return bindings;
}
