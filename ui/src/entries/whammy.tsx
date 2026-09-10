import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundWhammyUI from '../plugins/WhammyUI/BoundWhammyUI';
import { pluginMeta } from '../generated/whammyModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundWhammyUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
