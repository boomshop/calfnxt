import { useCallback } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import type { DynamicValue } from '@deutschesoft/awml';

/**
 * React read/write handle for an AWML `DynamicValue`.
 * Prefer this over manual `subscribe` in UI components.
 */
export function useDynamicValue<T>(
  dv: DynamicValue<T>,
  fallback: T,
): [T, (next: T) => void] {
  const value = useDynamicValueReadonly(dv, fallback);
  const setValue = useCallback(
    (next: T) => {
      dv.set(next);
    },
    [dv],
  );
  return [value, setValue];
}
