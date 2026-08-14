import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundExpanderUI from '../plugins/ExpanderUI/BoundExpanderUI';
import { pluginMeta } from '../generated/expanderModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundExpanderUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
