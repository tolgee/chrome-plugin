import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = { get: vi.fn(), set: vi.fn() };
const local = { get: vi.fn(), set: vi.fn() };
const storage: { session?: unknown; local: unknown } = { session, local };

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return storage;
    },
  },
}));

import { sessionArea } from './storageArea';

beforeEach(() => {
  storage.session = session;
});

describe('sessionArea', () => {
  it('uses storage.session where the browser has it', () => {
    expect(sessionArea()).toBe(session);
  });

  // Firefox got storage.session in 115, and manifest.json still supports 109: on those builds every sessionArea()
  // consumer silently lands in storage.local, which outlives the browser session.
  it('falls back to storage.local where storage.session is missing', () => {
    storage.session = undefined;

    expect(sessionArea()).toBe(local);
  });

  it('resolves the area per call, not once at import: a worker can start before the polyfill fills it in', () => {
    storage.session = undefined;
    expect(sessionArea()).toBe(local);

    storage.session = session;
    expect(sessionArea()).toBe(session);
  });
});
