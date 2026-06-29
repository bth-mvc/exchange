import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    env: {
      PORT: '4000',
      API_KEY_SERVER_URL: 'http://localhost:5000',
      SERVICE_TOKEN: 'test-service-token',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'lcov', 'html'],
    },
  },
})
