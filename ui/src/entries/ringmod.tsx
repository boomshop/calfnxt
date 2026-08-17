import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundRingmodUI from '../plugins/RingmodUI/BoundRingmodUI';
import { pluginMeta } from '../generated/ringmodModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundRingmodUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
