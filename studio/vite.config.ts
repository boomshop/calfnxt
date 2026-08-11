import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = path.resolve(__dirname);
const uiSrc = path.resolve(root, '../ui/src');
const studioNode = path.resolve(root, 'node_modules');

export default defineConfig({
  plugins: [react()],
  root,
  base: './',
  resolve: {
    alias: {
      '@calfnxt/ui': path.resolve(uiSrc, 'studioApi.ts'),
      // Force a single React / AUX copy when pulling in ../ui/src
      react: path.resolve(studioNode, 'react'),
      'react-dom': path.resolve(studioNode, 'react-dom'),
      '@deutschesoft/aux-widgets': path.resolve(
        studioNode,
        '@deutschesoft/aux-widgets',
      ),
      '@deutschesoft/awml': path.resolve(studioNode, '@deutschesoft/awml'),
      '@deutschesoft/use-aux-widgets': path.resolve(
        studioNode,
        '@deutschesoft/use-aux-widgets',
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: {
      allow: [root, path.resolve(root, '../ui')],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
});
