import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundPhonesUI from '../plugins/PhonesUI/BoundPhonesUI';
import { pluginMeta } from '../generated/phonesModel';
import { reportCssViewportOnce } from '../utils/reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce(pluginMeta.editor);
  }, []);
  return <BoundPhonesUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
