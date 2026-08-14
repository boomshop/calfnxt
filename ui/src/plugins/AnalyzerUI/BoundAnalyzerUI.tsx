import { AnalyzerUI } from './AnalyzerUI';
import { createBoundAnalyzerHost } from '../../host/analyzerHost';

const host = createBoundAnalyzerHost();

export default function BoundAnalyzerUI() {
  return <AnalyzerUI host={host} />;
}
