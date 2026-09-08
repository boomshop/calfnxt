import { WhammyUI } from './WhammyUI';
import { createBoundWhammyHost } from '../../host/whammyHost';

const host = createBoundWhammyHost();

export default function BoundWhammyUI() {
  return <WhammyUI host={host} />;
}
