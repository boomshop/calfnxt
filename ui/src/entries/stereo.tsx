import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundStereoUI from '../plugins/StereoUI/BoundStereoUI';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce();
  }, []);
  return <BoundStereoUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
