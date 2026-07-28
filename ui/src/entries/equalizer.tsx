import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundEqualizerUI from '../plugins/EqualizerUI/BoundEqualizerUI';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce();
  }, []);
  return <BoundEqualizerUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
