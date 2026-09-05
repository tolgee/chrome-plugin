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
        remove: async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            store.delete(key);
          }
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

const reply = (status: number, body: unknown) => ({
  status,
  statusText: '',
  headers: {},
  body: JSON.stringify(body),
});

const storedIds = () =>
  [...store.keys()].filter((key) => key.startsWith('uploadedImages:'));

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

  it('rememberUploadIfSuccessful remembers the id of a 2xx JSON response', async () => {
    const { rememberUploadIfSuccessful, wasUploadedThroughSession } =
      await import('./uploadedImages');

    await rememberUploadIfSuccessful(connection, reply(201, { id: 7 }));

    expect(await wasUploadedThroughSession(connection, '7')).toBe(true);
  });

  it('rememberUploadIfSuccessful remembers nothing from a non-2xx answer, even one carrying an id', async () => {
    const { rememberUploadIfSuccessful, wasUploadedThroughSession } =
      await import('./uploadedImages');

    await rememberUploadIfSuccessful(
      connection,
      reply(403, { code: 'permission_denied', id: 999 })
    );

    expect(await wasUploadedThroughSession(connection, '999')).toBe(false);
    expect(storedIds()).toEqual([]);
  });

  it('rememberUploadIfSuccessful writes no entry at all when the body is not JSON or carries no id', async () => {
    const { rememberUploadIfSuccessful } = await import('./uploadedImages');

    await rememberUploadIfSuccessful(connection, {
      status: 200,
      statusText: '',
      headers: {},
      body: '<html>not json</html>',
    });
    await rememberUploadIfSuccessful(
      connection,
      reply(201, { filename: 'no-id-here' })
    );

    // Without this the id-less body would be remembered under an ...:undefined key, widening what a later DELETE
    // is authorized against.
    expect(storedIds()).toEqual([]);
  });

  it('sweeps entries older than a day when a new upload is remembered, and never expires one on read', async () => {
    vi.useFakeTimers();
    try {
      const { rememberUploadedImage, wasUploadedThroughSession } = await import(
        './uploadedImages'
      );
      await rememberUploadedImage(connection, 'old');

      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      // A dialog left open for hours keeps the grant to clean up its own upload: reads never expire an id.
      expect(await wasUploadedThroughSession(connection, 'old')).toBe(true);

      vi.advanceTimersByTime(23 * 60 * 60 * 1000);
      await rememberUploadedImage(connection, 'fresh');

      expect(await wasUploadedThroughSession(connection, 'old')).toBe(false);
      expect(await wasUploadedThroughSession(connection, 'fresh')).toBe(true);
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
