import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundLimiterUI from '../plugins/LimiterUI/BoundLimiterUI';
import { pluginMeta } from '../generated/limiterModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundLimiterUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
