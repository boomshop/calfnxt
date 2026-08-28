import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundTunerUI from '../plugins/TunerUI/BoundTunerUI';
import { pluginMeta } from '../generated/tunerModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundTunerUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
