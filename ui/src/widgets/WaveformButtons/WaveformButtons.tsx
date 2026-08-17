import { Buttons } from '../Buttons';
import './WaveformButtons.scss';

/** Sine / Triangle / Square / Saw↑ / Saw↓ (last icon mirrored in CSS). */
export const LFO_WAVE_ENTRIES = [
  { icon: 'sine', value: 0 },
  { icon: 'triangle', value: 1 },
  { icon: 'rect', value: 2 },
  { icon: 'saw', value: 3 },
  { icon: 'saw', value: 4 },
] as const;

export interface WaveformButtonsProps {
  value: number;
  onChange: (value: number) => void;
  layout?: 'horizontal' | 'vertical';
  className?: string;
}

/**
 * Shared LFO / oscillator waveform selector (icons + mirrored saw-down).
 */
export function WaveformButtons(props: WaveformButtonsProps) {
  const { value, onChange, layout = 'horizontal', className } = props;
  const cls = ['WaveformButtons', className ?? ''].filter(Boolean).join(' ');
  return (
    <Buttons
      className={cls}
      layout={layout}
      entries={LFO_WAVE_ENTRIES}
      value={Math.round(value)}
      onChange={(v) => onChange(v as number)}
    />
  );
}
