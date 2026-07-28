import { Button } from '../Button';
import './Buttons.scss';

export type ButtonsEntry<T = unknown> = {
  label?: string;
  icon?: string;
  value: T;
};

export type ButtonsLayout = 'horizontal' | 'vertical';

export interface ButtonsProps<T = unknown> {
  entries: readonly ButtonsEntry<T>[];
  value: T;
  onChange: (value: T) => void;
  layout?: ButtonsLayout;
  className?: string;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number')
    return Math.round(a) === Math.round(b);
  return false;
}

export function Buttons<T = unknown>(props: ButtonsProps<T>) {
  const { entries, value, onChange, layout = 'horizontal', className } = props;
  const cls = ['Buttons', `layout-${layout}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} role="group">
      {entries.map((entry, i) => {
        const active = valuesEqual(value, entry.value);
        return (
          <Button
            key={i}
            label={entry.label ?? false}
            icon={entry.icon ?? false}
            state={active}
            onClick={() => onChange(entry.value)}
          />
        );
      })}
    </div>
  );
}
