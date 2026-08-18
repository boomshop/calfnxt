import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundPhaserUI from '../plugins/PhaserUI/BoundPhaserUI';
import { pluginMeta } from '../generated/phaserModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundPhaserUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
