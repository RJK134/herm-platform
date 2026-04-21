import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**/*.{test,spec}.ts'],
    // Run test files sequentially to avoid shared mock state conflicts
    fileParallelism: false,
    globals: false,
    testTimeout: 30_000,
    setupFiles: ['src/test/setup.ts'],
  },
});
