import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundTransientsUI from '../plugins/TransientsUI/BoundTransientsUI';
import { pluginMeta } from '../generated/transientsModel';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundTransientsUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
