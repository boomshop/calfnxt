import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundFlangerUI from '../plugins/FlangerUI/BoundFlangerUI';
import { pluginMeta } from '../generated/flangerModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundFlangerUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
