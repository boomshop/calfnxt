import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import BoundTransientsUI from '../plugins/TransientsUI/BoundTransientsUI';
import { reportCssViewportOnce } from '../reportViewport';
import '../styles.css';

function Root() {
  useEffect(() => {
    reportCssViewportOnce();
  }, []);
  return <BoundTransientsUI />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
