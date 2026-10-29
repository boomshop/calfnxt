import { AlignerUI } from './AlignerUI';
import { createBoundAlignerHost } from '../../host/alignerHost';

const host = createBoundAlignerHost();

export default function BoundAlignerUI() {
  return <AlignerUI host={host} />;
}
