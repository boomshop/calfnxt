import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundFilterUI from '../plugins/FilterUI/BoundFilterUI';
import { pluginMeta } from '../generated/filterModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundFilterUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
