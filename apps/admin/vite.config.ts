import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/v1': {
        target: 'https://laap-billing-sandbox.hussiensalah100.workers.dev',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
