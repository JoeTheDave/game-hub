import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Same alias the client uses for pure game modules (client tests import them).
    alias: { '@games': fileURLToPath(new URL('./server/src/games', import.meta.url)) },
  },
  test: {
    include: ['server/src/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node',
    // Route/socket suites share the game_hub_test database, so files run one at a time.
    fileParallelism: false,
  },
})
