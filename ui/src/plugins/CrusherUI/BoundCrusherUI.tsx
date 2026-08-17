import { CrusherUI } from './CrusherUI';
import { createBoundCrusherHost } from '../../host/crusherHost';

const host = createBoundCrusherHost();

export default function BoundCrusherUI() {
  return <CrusherUI host={host} />;
}
