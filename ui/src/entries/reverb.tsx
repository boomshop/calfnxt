import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundReverbUI from '../plugins/ReverbUI/BoundReverbUI';
import { pluginMeta } from '../generated/reverbModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundReverbUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
