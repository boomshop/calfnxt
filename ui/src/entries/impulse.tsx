import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundImpulseUI from '../plugins/ImpulseUI/BoundImpulseUI';
import { pluginMeta } from '../generated/impulseModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundImpulseUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
