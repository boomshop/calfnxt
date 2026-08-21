import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundSplitUI from '../plugins/SplitUI/BoundSplitUI';
import { pluginMeta } from '../generated/splitModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundSplitUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
