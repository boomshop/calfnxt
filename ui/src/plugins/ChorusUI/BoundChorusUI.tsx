import { ChorusUI } from './ChorusUI';
import { createBoundChorusHost } from '../../host/chorusHost';

const host = createBoundChorusHost();

export default function BoundChorusUI() {
  return <ChorusUI host={host} />;
}
