import { TransientsUI } from './TransientsUI';
import { createBoundTransientsHost } from '../../host/transientsHost';

const host = createBoundTransientsHost();

export default function BoundTransientsUI() {
  return <TransientsUI host={host} />;
}
