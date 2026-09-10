import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundOctaverUI from '../plugins/OctaverUI/BoundOctaverUI';
import { pluginMeta } from '../generated/octaverModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundOctaverUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
