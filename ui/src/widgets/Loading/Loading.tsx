import './Loading.scss';
import { CalfNxtLogo } from '../../components/CalfNxtLogo';

export interface LoadingProps {
  className?: string;
}

/** Suspense / lazy-load placeholder — style the animation in Loading.scss. */
export function Loading(props: LoadingProps) {
  const { className } = props;
  const cls = ['Loading', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="status" aria-label="Loading">
      <CalfNxtLogo className="logo" />
      <div className="bar">
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  );
}
