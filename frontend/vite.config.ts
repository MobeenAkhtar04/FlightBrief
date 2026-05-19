import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/brief': 'http://api:8000',     // internal docker network still 8000
      '/briefings': 'http://api:8000',
      '/health': 'http://api:8000',
    },
  },
})
