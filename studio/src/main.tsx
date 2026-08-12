import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { showWidgetInfo$ } from '@calfnxt/ui';
import { App } from './App';
import '../../ui/src/styles.css';
import './studio.css';

// Mark capture mode before React mounts (LevelMeters skip AUX falling).
(window as Window & { __CALFNXT_STUDIO__?: boolean }).__CALFNXT_STUDIO__ = true;

// Screenshots must never show WithInfo tip bubbles (default is on / localStorage).
showWidgetInfo$.set(false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
