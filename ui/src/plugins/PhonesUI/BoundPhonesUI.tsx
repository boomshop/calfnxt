import { PhonesUI } from './PhonesUI';
import { createBoundPhonesHost } from '../../host/phonesHost';

const host = createBoundPhonesHost();

export default function BoundPhonesUI() {
  return <PhonesUI host={host} />;
}
