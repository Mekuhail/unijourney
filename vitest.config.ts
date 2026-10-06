import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    // Keep test uploads away from the dev database's private files.
    env: { DATA_DIR: '/tmp/unijourney-test-data', DEMO_MODE: 'true', DEMO_CONTROL_TOKEN: 'test-operator-token-with-at-least-32-chars' }
  }
});
