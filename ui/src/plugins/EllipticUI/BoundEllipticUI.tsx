import { EllipticUI } from './EllipticUI';
import { createBoundEllipticHost } from '../../host/ellipticHost';

const host = createBoundEllipticHost();

export default function BoundEllipticUI() {
  return <EllipticUI host={host} />;
}
