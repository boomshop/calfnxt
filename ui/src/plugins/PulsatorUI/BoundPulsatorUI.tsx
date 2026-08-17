import { PulsatorUI } from './PulsatorUI';
import { createBoundPulsatorHost } from '../../host/pulsatorHost';

const host = createBoundPulsatorHost();

export default function BoundPulsatorUI() {
  return <PulsatorUI host={host} />;
}
