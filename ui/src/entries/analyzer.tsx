import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundAnalyzerUI from '../plugins/AnalyzerUI/BoundAnalyzerUI';
import { pluginMeta } from '../generated/analyzerModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundAnalyzerUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
