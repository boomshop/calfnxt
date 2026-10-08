import { DenoiserUI } from './DenoiserUI';
import { createBoundDenoiserHost } from '../../host/denoiserHost';

const host = createBoundDenoiserHost();

export default function BoundDenoiserUI() {
  return <DenoiserUI host={host} />;
}
