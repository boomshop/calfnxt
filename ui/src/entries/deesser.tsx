import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundDeesserUI from '../plugins/DeesserUI/BoundDeesserUI';
import { pluginMeta } from '../generated/deesserModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundDeesserUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
