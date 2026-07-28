import { StereoUI } from './StereoUI';
import { createBoundStereoHost } from '../../host/stereoHost';

const host = createBoundStereoHost();

export default function BoundStereoUI() {
  return <StereoUI host={host} />;
}
