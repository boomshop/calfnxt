import { BenderUI } from './BenderUI';
import { createBoundBenderHost } from '../../host/benderHost';

const host = createBoundBenderHost();

export default function BoundBenderUI() {
  return <BenderUI host={host} />;
}
