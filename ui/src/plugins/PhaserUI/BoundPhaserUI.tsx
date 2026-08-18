import { PhaserUI } from './PhaserUI';
import { createBoundPhaserHost } from '../../host/phaserHost';

const host = createBoundPhaserHost();

export default function BoundPhaserUI() {
  return <PhaserUI host={host} />;
}
