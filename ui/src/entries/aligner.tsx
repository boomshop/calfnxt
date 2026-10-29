import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundAlignerUI from '../plugins/AlignerUI/BoundAlignerUI';
import { pluginMeta } from '../generated/alignerModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundAlignerUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
