import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundCrusherUI from '../plugins/CrusherUI/BoundCrusherUI';
import { pluginMeta } from '../generated/crusherModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundCrusherUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
