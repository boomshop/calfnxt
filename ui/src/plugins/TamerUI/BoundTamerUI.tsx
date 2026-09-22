import { TamerUI } from './TamerUI';
import { createBoundTamerHost } from '../../host/tamerHost';

const host = createBoundTamerHost();

export default function BoundTamerUI() {
  return <TamerUI host={host} />;
}
