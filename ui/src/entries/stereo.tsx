import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundStereoUI from '../plugins/StereoUI/BoundStereoUI';
import { pluginMeta } from '../generated/stereoModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundStereoUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
