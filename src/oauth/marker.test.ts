import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: async (key: string) =>
          store.has(key) ? { [key]: store.get(key) } : {},
        set: async (obj: Record<string, unknown>) =>
          Object.entries(obj).forEach(([k, v]) => store.set(k, v)),
      },
    },
  },
}));

import { loadOAuthMarker, storeOAuthMarker } from './marker';

describe('OAuth marker', () => {
  beforeEach(() => store.clear());

  it('round-trips apiUrl, projectId and the authoritative projectKey', async () => {
    await storeOAuthMarker('https://site.example', {
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });
    expect(await loadOAuthMarker('https://site.example')).toEqual({
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });
  });

  it('returns null when no marker exists for the origin', async () => {
    expect(await loadOAuthMarker('https://none.example')).toBeNull();
  });

  it('returns null for a non-oauth record (e.g. an api-key entry)', async () => {
    store.set('https://k.example', { apiUrl: 'https://api', apiKey: 'x' });
    expect(await loadOAuthMarker('https://k.example')).toBeNull();
  });
});
