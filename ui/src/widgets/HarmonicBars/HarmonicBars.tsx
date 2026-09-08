import { useMemo } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { harmonicLevels } from '../../dsp/tapDistortion';
import './HarmonicBars.scss';

export interface HarmonicBarsProps {
  className?: string;
  drive$: DynamicValue<number>;
  blend$: DynamicValue<number>;
  asymmetry$?: DynamicValue<number>;
  /** How many overtones after the fundamental (default H2…H6). */
  count?: number;
}

const LABELS = ['2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/**
 * Relative harmonic content of a unit sine through the current waveshape.
 */
export function HarmonicBars(props: HarmonicBarsProps) {
  const { className, drive$, blend$, asymmetry$, count = 5 } = props;
  const drive = useDynamicValueReadonly(drive$, 0);
  const blend = useDynamicValueReadonly(blend$, 0);
  const asymmetry = useDynamicValueReadonly(asymmetry$, 0);

  const levels = useMemo(
    () => harmonicLevels(blend, drive, count + 1, asymmetry),
    [blend, drive, asymmetry, count],
  );

  const max = Math.max(0.15, ...levels);
  const cls = ['HarmonicBars', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {levels.map((level, i) => {
        const h = Math.min(1, level / max);
        return (
          <div key={LABELS[i] ?? i} className="bar">
            <div className="track">
              <div className="fill" style={{ height: `${h * 100}%` }} />
            </div>
            <div className="label">{LABELS[i] ?? String(i + 2)}</div>
          </div>
        );
      })}
    </div>
  );
}
