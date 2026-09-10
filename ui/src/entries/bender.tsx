import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundBenderUI from '../plugins/BenderUI/BoundBenderUI';
import { pluginMeta } from '../generated/benderModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundBenderUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
