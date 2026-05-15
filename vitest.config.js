import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    hookTimeout: 10000,

    server: {
      deps: {
        inline: [
          'pdf-parse',
          'mammoth',
          'xlsx',
          'tesseract.js',
          'turndown',
        ],
      },
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['backend/src/**/*.js'],
      exclude: ['backend/src/index.js'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
      },
    },
  },
});