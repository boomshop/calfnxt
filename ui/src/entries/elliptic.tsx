import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundEllipticUI from '../plugins/EllipticUI/BoundEllipticUI';
import { pluginMeta } from '../generated/ellipticModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundEllipticUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
