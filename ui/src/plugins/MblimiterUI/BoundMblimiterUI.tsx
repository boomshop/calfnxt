import { MblimiterUI } from './MblimiterUI';
import { createBoundMblimiterHost } from '../../host/mblimiterHost';

const host = createBoundMblimiterHost();

export default function BoundMblimiterUI() {
  return <MblimiterUI host={host} />;
}
