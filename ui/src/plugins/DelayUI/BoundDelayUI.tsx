import { DelayUI } from './DelayUI';
import { createBoundDelayHost } from '../../host/delayHost';

const host = createBoundDelayHost();

export default function BoundDelayUI() {
  return <DelayUI host={host} />;
}
