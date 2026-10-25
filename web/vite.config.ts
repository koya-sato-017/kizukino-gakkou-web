import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 公開先はCloudflare Pagesのルート。必要な場合だけ環境変数で変更する。
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
})
