import { OctaverUI } from './OctaverUI';
import { createBoundOctaverHost } from '../../host/octaverHost';

const host = createBoundOctaverHost();

export default function BoundOctaverUI() {
  return <OctaverUI host={host} />;
}
