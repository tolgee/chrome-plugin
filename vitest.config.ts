import { defineConfig } from 'vitest/config';

// Standalone from the crxjs build configs on purpose: these are pure unit tests (popup logic + helpers) that need
// neither the extension bundler plugins nor a DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
