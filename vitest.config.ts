import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/src/**/*.test.ts'],
    environment: 'node',
    // Route/socket suites share the game_hub_test database, so files run one at a time.
    fileParallelism: false,
  },
})
