import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_ICON__: JSON.stringify('./images/minimix-logo.png'),
    // 第三方致谢列表改由 scripts/generate-third-party-licenses.mjs 从 lockfile
    // 解析生成到 src/generated/about-deps.json，main.js 通过 import 引入。
    // 不再用 define 注入，避免手写版本号随 npm update 漂移。
  },
  base: './',
  server: {
    port: 18739,
    strictPort: true,
    watch: {
      // 忽略 Rust 编译产物（src-tauri/target）。Rust 链接时会锁定
      // minimix_lib.dll，Vite 尝试 watch 它会触发 EBUSY 崩溃。
      ignored: [
        '**/src-tauri/target/**',
        '**/node_modules/**',
      ],
    },
  },
  // Dev 模式下，本地源文件首次按需转译极慢（main.js / floating-toolbar.js
  // 各需 ~45s）。将它们加入 optimizeDeps，让 Vite 用 esbuild 预构建，
  // 首屏加载从数十秒降到 ~2s。
  optimizeDeps: {
    include: [
      'lucide',
      './main.js',
      './stitch-engine.js',
      './floating-toolbar.js',
      './annotation.js',
      './image-item.js',
      './undo-manager.js',
      './slider-widget.js',
      './src/i18n/i18n.js',
      './src/i18n/locales/en.js',
      './src/i18n/locales/zh-CN.js',
    ],
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'esnext',
  },
  envPrefix: ['VITE_', 'TAURI_'],
  clearScreen: false,
});
