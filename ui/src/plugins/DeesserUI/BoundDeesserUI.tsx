import { DeesserUI } from './DeesserUI';
import { createBoundDeesserHost } from '../../host/deesserHost';

const host = createBoundDeesserHost();

export default function BoundDeesserUI() {
  return <DeesserUI host={host} />;
}
