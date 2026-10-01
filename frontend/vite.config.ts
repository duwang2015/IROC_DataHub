import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built files go straight into the backend package so `iroc-datahub serve` can serve them.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/iroc_datahub/static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8765',
    },
  },
})
