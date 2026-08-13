import { LimiterUI } from './LimiterUI';
import { createBoundLimiterHost } from '../../host/limiterHost';

const host = createBoundLimiterHost();

export default function BoundLimiterUI() {
  return <LimiterUI host={host} />;
}
