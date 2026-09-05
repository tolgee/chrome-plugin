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
        remove: async (key: string) => {
          store.delete(key);
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

  it('loses none of a batch of ids remembered concurrently (a multi-file upload)', async () => {
    const { rememberUploadedImage, wasUploadedThroughSession } = await import(
      './uploadedImages'
    );
    const ids = ['1', '2', '3', '4', '5'];

    await Promise.all(ids.map((id) => rememberUploadedImage(connection, id)));

    for (const id of ids) {
      expect(await wasUploadedThroughSession(connection, id)).toBe(true);
    }
  });

  it('rememberUploadIfSuccessful only remembers a 2xx response whose body is JSON with an id', async () => {
    const { rememberUploadIfSuccessful, wasUploadedThroughSession } =
      await import('./uploadedImages');

    await rememberUploadIfSuccessful(connection, {
      status: 403,
      statusText: '',
      headers: {},
      body: JSON.stringify({ code: 'permission_denied', id: 999 }),
    });
    await rememberUploadIfSuccessful(connection, {
      status: 200,
      statusText: '',
      headers: {},
      body: '<html>not json</html>',
    });
    await rememberUploadIfSuccessful(connection, {
      status: 201,
      statusText: '',
      headers: {},
      body: JSON.stringify({ filename: 'no-id-here' }),
    });
    await rememberUploadIfSuccessful(connection, {
      status: 201,
      statusText: '',
      headers: {},
      body: JSON.stringify({ id: 7 }),
    });

    expect(await wasUploadedThroughSession(connection, '999')).toBe(false);
    expect(await wasUploadedThroughSession(connection, '7')).toBe(true);
  });

  it('prunes and refuses an id remembered more than an hour ago', async () => {
    vi.useFakeTimers();
    try {
      const { rememberUploadedImage, wasUploadedThroughSession } = await import(
        './uploadedImages'
      );
      await rememberUploadedImage(connection, '42');

      vi.advanceTimersByTime(61 * 60 * 1000);

      expect(await wasUploadedThroughSession(connection, '42')).toBe(false);
      const key = [...store.keys()].find((k) => k.endsWith(':42'));
      expect(store.has(key!)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives the worker module being re-instantiated (an MV3 restart), because it lives in storage.session', async () => {
    const before = await import('./uploadedImages');
    await before.rememberUploadedImage(connection, '42');

    vi.resetModules();
    const after = await import('./uploadedImages');

    expect(await after.wasUploadedThroughSession(connection, '42')).toBe(true);
  });
});
