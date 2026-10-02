/// <reference types="vite/client" />

interface Window {
  __calfnxtOnHost?: (msg: unknown) => void;
  __calfnxtStudioSetTheme?: (
    mode: 'day' | 'night',
    accent: 'calfnxt' | 'lime' | 'fire' | 'sea' | 'slick',
  ) => void;
}
