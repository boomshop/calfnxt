import { SplitUI } from './SplitUI';
import { createBoundSplitHost } from '../../host/splitHost';

const host = createBoundSplitHost();

export default function BoundSplitUI() {
  return <SplitUI host={host} />;
}
