import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundDelayUI from '../plugins/DelayUI/BoundDelayUI';
import { pluginMeta } from '../generated/delayModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundDelayUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
