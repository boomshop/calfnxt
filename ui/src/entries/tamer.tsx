import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundTamerUI from '../plugins/TamerUI/BoundTamerUI';
import { pluginMeta } from '../generated/tamerModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundTamerUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
