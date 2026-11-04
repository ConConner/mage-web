import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const alias = {
  '@core': resolve(import.meta.dirname, 'src/core'),
  '@platform': resolve(import.meta.dirname, 'src/platform'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
};

export default defineConfig({
  main: { resolve: { alias }, build: { rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/main/index.ts') } } } },
  preload: { resolve: { alias }, build: { rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') } } } },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: { rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/renderer/index.html') } } },
  },
});
