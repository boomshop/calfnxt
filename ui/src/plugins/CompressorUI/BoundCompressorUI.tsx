import { CompressorUI } from './CompressorUI';
import { createBoundCompressorHost } from '../../host/compressorHost';

const host = createBoundCompressorHost();

export default function BoundCompressorUI() {
  return <CompressorUI host={host} />;
}
