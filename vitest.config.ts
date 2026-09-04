import { defineConfig } from 'vitest/config';

// Not the crxjs build config: these tests need no extension bundler plugins or DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // A vi.spyOn(...) installed by one test must not leak its mocked behavior into a later, unrelated test.
    restoreMocks: true,
  },
});
