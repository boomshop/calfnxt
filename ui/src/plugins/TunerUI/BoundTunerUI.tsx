import { TunerUI } from './TunerUI';
import { createBoundTunerHost } from '../../host/tunerHost';

const host = createBoundTunerHost();

export default function BoundTunerUI() {
  return <TunerUI host={host} />;
}
