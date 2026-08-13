import { useEffect, useMemo, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { harmonicLevels } from '../../dsp/tapDistortion';
import './HarmonicBars.scss';

export interface HarmonicBarsProps {
  className?: string;
  drive$: DynamicValue<number>;
  blend$: DynamicValue<number>;
  /** How many overtones after the fundamental (default H2…H6). */
  count?: number;
}

const LABELS = ['2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/**
 * Relative harmonic content of a unit sine through the current waveshape.
 */
export function HarmonicBars(props: HarmonicBarsProps) {
  const { className, drive$, blend$, count = 5 } = props;
  const [drive, setDrive] = useState(() => drive$.value);
  const [blend, setBlend] = useState(() => blend$.value);

  useEffect(() => {
    const u1 = drive$.subscribe((v) => setDrive(v));
    const u2 = blend$.subscribe((v) => setBlend(v));
    return () => {
      u1();
      u2();
    };
  }, [drive$, blend$]);

  const levels = useMemo(
    () => harmonicLevels(blend, drive, count + 1),
    [blend, drive, count],
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
