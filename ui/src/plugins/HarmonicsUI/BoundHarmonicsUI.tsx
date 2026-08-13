import { HarmonicsUI } from './HarmonicsUI';
import { createBoundHarmonicsHost } from '../../host/harmonicsHost';

const host = createBoundHarmonicsHost();

export default function BoundHarmonicsUI() {
  return <HarmonicsUI host={host} />;
}
