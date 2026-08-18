import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundChorusUI from '../plugins/ChorusUI/BoundChorusUI';
import { pluginMeta } from '../generated/chorusModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundChorusUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
