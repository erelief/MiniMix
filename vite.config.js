import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_ICON__: JSON.stringify('src-tauri/icons/icon.png'),
  },
  base: './',
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'esnext',
  },
  envPrefix: ['VITE_', 'TAURI_'],
  clearScreen: false,
});
