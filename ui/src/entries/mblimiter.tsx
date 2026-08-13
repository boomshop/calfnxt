import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundMblimiterUI from '../plugins/MblimiterUI/BoundMblimiterUI';
import { pluginMeta } from '../generated/mblimiterModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundMblimiterUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
