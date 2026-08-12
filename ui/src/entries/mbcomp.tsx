import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundMbcompUI from '../plugins/MbcompUI/BoundMbcompUI';
import { pluginMeta } from '../generated/mbcompModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundMbcompUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
