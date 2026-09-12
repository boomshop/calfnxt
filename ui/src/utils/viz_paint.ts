import { useEffect, useRef } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';

/**
 * High-rate DynamicValue → imperative paint (custom SVG/canvas).
 * Never routes viz through React state / `useDynamicValueReadonly`.
 */
export function useVizPaint<T>(
  dv: DynamicValue<T> | undefined,
  paint: (value: T) => void,
  fallback: T,
): void {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    if (!dv) {
      paintRef.current(fallbackRef.current);
      return;
    }
    return dv.subscribe((v) => {
      paintRef.current((v ?? fallbackRef.current) as T);
    }, true);
  }, [dv]);
}
