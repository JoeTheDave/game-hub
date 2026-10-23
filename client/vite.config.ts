import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

// https://vite.dev/config/
export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      // Pure, framework-free game modules (engines, card data) shared with the server.
      '@games': fileURLToPath(new URL('../server/src/games', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.VITE_PORT ?? '') || 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
