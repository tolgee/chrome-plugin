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

vi.mock('../oauth/tokenScope', () => ({
  projectKeyForToken: () => '7',
}));

import { loadValues, storeValues } from './storage';

const ORIGIN = 'https://site.example';

describe('popup storage routing', () => {
  beforeEach(() => store.clear());

  it('persists an OAuth session as a marker and never writes the access token', async () => {
    await storeValues({
      apiUrl: 'https://app.tolgee.io',
      authToken: 'jwt',
      projectId: 7,
    });
    const record = store.get(ORIGIN) as Record<string, unknown>;
    expect(record).toEqual({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
      projectKey: '7',
    });
    expect(record.authToken).toBeUndefined();
    expect(record.apiKey).toBeUndefined();
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

  it('an incomplete value (token without apiUrl) clears the record rather than half-persisting', async () => {
    store.set(ORIGIN, { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' });
    await storeValues({ authToken: 'jwt' });
    expect(store.has(ORIGIN)).toBe(false);
  });

  it('loadValues surfaces the stored fields (oauth flag included)', async () => {
    store.set(ORIGIN, {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
    });
    expect(await loadValues()).toEqual({
      apiKey: undefined,
      apiUrl: 'https://app.tolgee.io',
      branch: undefined,
      oauth: true,
      projectId: 7,
    });
  });
});
