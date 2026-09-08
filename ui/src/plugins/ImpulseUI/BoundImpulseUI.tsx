import { ImpulseUI } from './ImpulseUI';
import { createBoundImpulseHost } from '../../host/impulseHost';

const host = createBoundImpulseHost();

export default function BoundImpulseUI() {
  return <ImpulseUI host={host} />;
}
