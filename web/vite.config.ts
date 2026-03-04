import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/kizukino-gakkou-web/', // GitHub Pages 用のベースパス
  plugins: [react()],
})
