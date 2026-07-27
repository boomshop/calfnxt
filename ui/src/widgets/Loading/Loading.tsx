import './Loading.scss';
import Logo from '../../images/calfNXT.svg';

export interface LoadingProps {
  className?: string;
}

/** Suspense / lazy-load placeholder — style the animation in Loading.scss. */
export function Loading(props: LoadingProps) {
  const { className } = props;
  const cls = ['Loading', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="status" aria-label="Loading">
      <img src={Logo} className="logo" alt="" />
      <div className="bar">
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  );
}
