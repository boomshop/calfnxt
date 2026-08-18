import { FlangerUI } from './FlangerUI';
import { createBoundFlangerHost } from '../../host/flangerHost';

const host = createBoundFlangerHost();

export default function BoundFlangerUI() {
  return <FlangerUI host={host} />;
}
