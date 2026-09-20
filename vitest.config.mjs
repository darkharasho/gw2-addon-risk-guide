import { defineConfig } from 'vitest/config'

// This machine runs heavy apps alongside dev work; cap test parallelism at 2 forks.
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { minForks: 1, maxForks: 2 } },
  },
})
