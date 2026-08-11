import { ReverbUI } from './ReverbUI';
import { createBoundReverbHost } from '../../host/reverbHost';

const host = createBoundReverbHost();

export default function BoundReverbUI() {
  return <ReverbUI host={host} />;
}
