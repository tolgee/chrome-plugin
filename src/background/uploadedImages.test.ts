import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        get: async (key: string | null) => {
          if (key === null) {
            return Object.fromEntries(store);
          }
          return store.has(key) ? { [key]: store.get(key) } : {};
        },
        set: async (obj: Record<string, unknown>) => {
          Object.entries(obj).forEach(([k, v]) => store.set(k, v));
        },
      },
      local: {
        get: async () => ({}),
        set: async () => undefined,
      },
    },
  },
}));

const connection = { apiUrl: 'https://app.tolgee.io', projectKey: '7' };

beforeEach(() => {
  store.clear();
});

describe('uploadedImages', () => {
  it('recognises an id remembered earlier in this session', async () => {
    const { rememberUploadedImage, wasUploadedThroughSession } = await import(
      './uploadedImages'
    );
    await rememberUploadedImage(connection, '42');

    expect(await wasUploadedThroughSession(connection, '42')).toBe(true);
    expect(await wasUploadedThroughSession(connection, '99')).toBe(false);
  });

  it('does not confuse ids uploaded for a different connection', async () => {
    const { rememberUploadedImage, wasUploadedThroughSession } = await import(
      './uploadedImages'
    );
    await rememberUploadedImage(connection, '42');

    const other = { apiUrl: 'https://app.tolgee.io', projectKey: '9' };
    expect(await wasUploadedThroughSession(other, '42')).toBe(false);
  });

  it('survives the worker module being re-instantiated (an MV3 restart), because it lives in storage.session', async () => {
    const before = await import('./uploadedImages');
    await before.rememberUploadedImage(connection, '42');

    // A real worker restart tears down every module-level variable; resetModules simulates re-importing
    // uploadedImages.ts fresh against the same (persistent) storage.session backing.
    vi.resetModules();
    const after = await import('./uploadedImages');

    expect(await after.wasUploadedThroughSession(connection, '42')).toBe(true);
  });
});
