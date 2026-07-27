import { EqualizerUI } from './EqualizerUI';
import { createBoundEqualizerHost } from '../../host/equalizerHost';

const host = createBoundEqualizerHost();

export default function BoundEqualizerUI() {
  return <EqualizerUI host={host} />;
}
