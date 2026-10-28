import { defineConfig } from 'vitest/config';

// Load the Dev DATABASE_URL from .env into the test process.
process.loadEnvFile('.env');

// Integration tests run only against the Dev database (ADR-7); DATABASE_URL comes from .env.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
