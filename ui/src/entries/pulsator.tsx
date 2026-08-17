import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundPulsatorUI from '../plugins/PulsatorUI/BoundPulsatorUI';
import { pluginMeta } from '../generated/pulsatorModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundPulsatorUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
