import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';

/* legacy 插件为不支持 ES 模块的老电视浏览器额外生成一套 ES5 + polyfill 的代码 */
export default defineConfig({
  plugins: [
    vue(),
    legacy({ targets: ['Chrome >= 37', 'Android >= 5', 'iOS >= 10', 'Safari >= 10'] })   // 安卓 6 早期 WebView 可能低至 Chrome 37
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src'), '@shared': path.resolve(__dirname, '../shared') }
  },
  css: { preprocessorOptions: { scss: { additionalData: '@import "@/styles/tokens.scss";\n' } } },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:18630',
      '/ws': { target: 'ws://localhost:18630', ws: true }
    }
  },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 800 }
});
