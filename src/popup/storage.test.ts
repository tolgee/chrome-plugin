import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: async () => [{ url: 'https://site.example/page' }],
    },
    storage: {
      local: {
        get: async (key: string) =>
          store.has(key) ? { [key]: store.get(key) } : {},
        set: async (obj: Record<string, unknown>) =>
          Object.entries(obj).forEach(([k, v]) => store.set(k, v)),
        remove: async (key: string) => {
          store.delete(key);
        },
      },
    },
  },
}));

import { loadValues, storeValues } from './storage';

const ORIGIN = 'https://site.example';

describe('popup storage routing', () => {
  beforeEach(() => store.clear());

  it('for an OAuth session, updates only the marker projectId hint (never the projectKey session identity)', async () => {
    store.set(ORIGIN, {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 5,
      projectKey: '5',
    });

    await storeValues({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
    });

    const record = store.get(ORIGIN) as Record<string, unknown>;
    expect(record).toEqual({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
      projectKey: '5',
    });
    expect(JSON.stringify(record)).not.toContain('token');
    expect(record.apiKey).toBeUndefined();
  });

  it('for an OAuth session, remembers the branch override on the marker so reopening the popup restores it', async () => {
    store.set(ORIGIN, {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 5,
      projectKey: '5',
    });

    await storeValues({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 5,
      branch: 'feature/checkout',
    });
    expect((await loadValues()).branch).toBe('feature/checkout');

    await storeValues({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 5,
      branch: undefined,
    });
    expect((await loadValues()).branch).toBeUndefined();
  });

  it('for an OAuth session on an origin with no existing marker, does nothing (never fabricates one)', async () => {
    await storeValues({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
    });

    expect(store.has(ORIGIN)).toBe(false);
  });

  it('persists an api-key session as a plain record without the oauth flag', async () => {
    await storeValues({
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      branch: 'feat',
    });
    expect(store.get(ORIGIN)).toEqual({
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      branch: 'feat',
    });
  });

  it('removes the origin record when neither credential is present', async () => {
    store.set(ORIGIN, { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' });
    await storeValues(null);
    expect(store.has(ORIGIN)).toBe(false);
  });

  it('an incomplete value (signed in without apiUrl) clears the record rather than half-persisting', async () => {
    store.set(ORIGIN, { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' });
    await storeValues({ oauth: true });
    expect(store.has(ORIGIN)).toBe(false);
  });

  it('loadValues surfaces the stored fields, including the authoritative projectKey', async () => {
    store.set(ORIGIN, {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
      projectKey: '5',
    });
    expect(await loadValues()).toEqual({
      apiKey: undefined,
      apiUrl: 'https://app.tolgee.io',
      branch: undefined,
      oauth: true,
      projectId: 7,
      projectKey: '5',
    });
  });
});
