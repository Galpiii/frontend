import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const target =
    loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL ||
    'http://localhost:8080'
  const proxy = {
    '/auth/token': { target, changeOrigin: true },
    '/auth/refresh': { target, changeOrigin: true },
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
  }
})
