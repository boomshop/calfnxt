import { useCallback, useEffect, useRef } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { MultiMeter as AuxMultiMeter } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import {
  levelMeterGradientMap,
  useThemeColors,
} from '../../theme/themeColors';
import './MultiMeter.scss';

const MultiMeterBindings = {
  value$: { name: 'value' },
  count$: { name: 'count' },
};

/**
 * Compact header-friendly defaults (LevelMeter options are forwarded to each bar).
 *
 * Meter.base stays at default `false` (= min) so the bar fills from silence.
 * Scale-only base for the 0 dB label uses `scale.base` — but Meter.initialize
 * later does set('base', false)→min and inherit_options stomps Scale.base.
 * We re-pin `scale.base` after mount / count changes (see MultiMeter).
 */
const MultiMeterOptions = {
  label: false,
  show_value: false,
  show_clip: false,
  gap_labels: 20,
  gap_dots: 10,
  min: -96,
  max: 12,
  value: [-96, -96],
  levels: [3, 6, 12],
  count: 2,
  labels: ['L', 'R'],
  layout: 'top',
  falling: 10,
  falling_duration: 1000,
  falling_init: 50,
  segment: 1,
  show_hold: true,
  hold_size: 2,
  auto_hold: 2000,
  scale: 'decibel',
  log_factor: 3,
  'scale.labels': (v: number) => v.toFixed(0),
  'scale.base': 0,
};

const MultiMeterWidget = componentFromWidget(
  AuxMultiMeter,
  MultiMeterBindings,
  MultiMeterOptions,
  'MultiMeter',
);

type AuxMultiMeterInstance = {
  set: (key: string, value: unknown) => void;
  subscribe: (event: string, cb: (...args: unknown[]) => void) => () => void;
  isDestructed: () => boolean;
};

/** Scale label base only — never Meter.base (that would shift the bar fill). */
function pinScaleBase(mm: AuxMultiMeterInstance | null) {
  if (!mm || mm.isDestructed()) return;
  mm.set('scale.base', 0);
}

export interface MultiMeterProps {
  value$?: DynamicValue<number[]>;
  count$?: DynamicValue<number>;
  labels?: string[];
  className?: string;
  [key: string]: unknown;
}

export function MultiMeter(props: MultiMeterProps) {
  const colors = useThemeColors();
  const mmRef = useRef<AuxMultiMeterInstance | null>(null);
  const rafRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);

  const schedulePin = useCallback((mm: AuxMultiMeterInstance) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => pinScaleBase(mm));
  }, []);

  const attach = useCallback(
    (mm: AuxMultiMeterInstance) => {
      unsubRef.current?.();
      unsubRef.current = null;
      if (mm.isDestructed()) return;
      unsubRef.current = mm.subscribe('set_count', () => schedulePin(mm));
      schedulePin(mm);
    },
    [schedulePin],
  );

  const detach = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    unsubRef.current?.();
    unsubRef.current = null;
  }, []);

  const widgetRef = useCallback(
    (w: AuxMultiMeterInstance | null) => {
      mmRef.current = w;
      if (!w) {
        detach();
        return;
      }
      attach(w);
    },
    [attach, detach],
  );

  useEffect(() => () => detach(), [detach]);

  // Push theme paints when accents / day-night change (inherit_options on bars).
  useEffect(() => {
    const mm = mmRef.current;
    if (!mm || mm.isDestructed()) return;
    mm.set('foreground', colors.background);
    mm.set('gradient', levelMeterGradientMap(colors));
  }, [colors]);

  return (
    <MultiMeterWidget
      {...props}
      widgetRef={widgetRef}
      foreground={colors.background}
      gradient={levelMeterGradientMap(colors)}
    />
  );
}
