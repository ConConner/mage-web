import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/** Standalone browser build of the workbench (no Electron). */
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve(import.meta.dirname, 'src/core'),
      '@platform': resolve(import.meta.dirname, 'src/platform'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
    },
  },
  build: { outDir: resolve(import.meta.dirname, 'dist/web'), emptyOutDir: true },
  server: { port: 5199 },
});
