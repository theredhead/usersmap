import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/**/*.integration.spec.ts'], testTimeout: 30000 },
});
