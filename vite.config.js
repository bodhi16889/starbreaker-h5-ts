// 用 .js 設定檔，避免多一支 tsc 檢查（專案只需要 build 時的 esbuild 轉譯）
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2019', cssCodeSplit: false, assetsInlineLimit: 8192 },
});
