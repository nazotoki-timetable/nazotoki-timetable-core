import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相対パス対応（GitHub Pages等で任意のサブパスでも動作可能）
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
