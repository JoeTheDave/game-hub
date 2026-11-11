import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

/**
 * One id per build. The client bakes it in (`__BUILD_ID__`), and the build writes it to
 * dist/client/build-id.txt, which the server serves at GET /api/version. A page left open across
 * a deploy sees the id change and reloads itself (client/src/lib/buildVersion.ts). Dev is 'dev'.
 */
const BUILD_ID = process.env.BUILD_ID || `${Date.now().toString(36)}`

function writeBuildId(id: string): Plugin {
  return {
    name: 'write-build-id',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-id.txt', source: id })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  root: 'client',
  plugins: [react(), writeBuildId(BUILD_ID)],
  define: {
    __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev'),
  },
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
}))
