import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', 'node_modules/**'],
    setupFiles: ['src/test-setup.ts'],
  },
});
