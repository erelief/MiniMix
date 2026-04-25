import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_ICON__: JSON.stringify('/images/minimix-logo.png'),
    __ABOUT_DEPS__: JSON.stringify([
      { name: 'Tauri', version: '2', url: 'https://tauri.app' },
      { name: 'Vite', version: '6', url: 'https://vite.dev' },
      { name: 'Lucide', url: 'https://lucide.dev' },
    ]),
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
