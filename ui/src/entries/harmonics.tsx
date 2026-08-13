import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundHarmonicsUI from '../plugins/HarmonicsUI/BoundHarmonicsUI';
import { pluginMeta } from '../generated/harmonicsModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundHarmonicsUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
