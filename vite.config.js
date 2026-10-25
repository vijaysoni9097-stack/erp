import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backend = new URL(env.VITE_API_BASE_URL || 'https://pharmacy-erp-testing-api.onrender.com/api/v1')
  const proxy = {
    '/api/v1': {
      target: backend.origin,
      changeOrigin: true,
      rewrite: path => path.replace(/^\/api\/v1/, backend.pathname.replace(/\/$/, '')),
    },
  }
  return {
    plugins: [react()],
    server: { proxy },
  }
})
