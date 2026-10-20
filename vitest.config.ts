import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.spec.ts', 'shared/**/*.spec.ts'],
    exclude: ['apps/**/*.integration.spec.ts'],
  },
});
