import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**/*.{test,spec}.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['src/test/setup.ts'],
  },
});
