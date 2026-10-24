import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Cloudflare Pagesでは VITE_BASE_PATH=/ を指定して同じソースを使う。
  base: process.env.VITE_BASE_PATH || '/kizukino-gakkou-web/',
  plugins: [react()],
})
