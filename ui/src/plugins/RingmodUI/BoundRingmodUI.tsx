import { RingmodUI } from './RingmodUI';
import { createBoundRingmodHost } from '../../host/ringmodHost';

const host = createBoundRingmodHost();

export default function BoundRingmodUI() {
  return <RingmodUI host={host} />;
}
