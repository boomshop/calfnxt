import { ExpanderUI } from './ExpanderUI';
import { createBoundExpanderHost } from '../../host/expanderHost';

const host = createBoundExpanderHost();

export default function BoundExpanderUI() {
  return <ExpanderUI host={host} />;
}
