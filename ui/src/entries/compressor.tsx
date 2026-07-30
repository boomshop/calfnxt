import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundCompressorUI from '../plugins/CompressorUI/BoundCompressorUI';
import { pluginMeta } from '../generated/compressorModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundCompressorUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
