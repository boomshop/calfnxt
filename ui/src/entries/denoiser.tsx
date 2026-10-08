import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundDenoiserUI from '../plugins/DenoiserUI/BoundDenoiserUI';
import { pluginMeta } from '../generated/denoiserModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundDenoiserUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
