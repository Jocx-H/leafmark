import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

const sharedDir = fileURLToPath(new URL('./src/shared', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@shared': sharedDir
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000
  }
})
