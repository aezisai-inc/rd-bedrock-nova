import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['domain/**/*.ts', 'application/**/*.ts'],
      exclude: ['**/__tests__/**', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, './domain'),
      '@application': path.resolve(__dirname, './application'),
      '@infrastructure': path.resolve(__dirname, './infrastructure'),
      '@services': path.resolve(__dirname, './services'),
    },
  },
});
