import { MbcompUI } from './MbcompUI';
import { createBoundMbcompHost } from '../../host/mbcompHost';

const host = createBoundMbcompHost();

export default function BoundMbcompUI() {
  return <MbcompUI host={host} />;
}
