import { FilterUI } from './FilterUI';
import { createBoundFilterHost } from '../../host/filterHost';

const host = createBoundFilterHost();

export default function BoundFilterUI() {
  return <FilterUI host={host} />;
}
