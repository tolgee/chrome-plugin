import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: async (key: string | null) => {
          if (key === null) {
            return Object.fromEntries(store);
          }
          return store.has(key) ? { [key]: store.get(key) } : {};
        },
        set: async (obj: Record<string, unknown>) =>
          Object.entries(obj).forEach(([k, v]) => store.set(k, v)),
        remove: async (key: string) => {
          store.delete(key);
        },
      },
    },
  },
}));

import {
  clearMarker,
  isSessionReferencedByAnyOrigin,
  loadOAuthMarker,
  storeOAuthMarker,
  updateMarkerProjectHint,
} from './marker';

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

  it('updateMarkerProjectHint updates only projectId, leaving projectKey (the session identity) untouched', async () => {
    await storeOAuthMarker('https://site.example', {
      apiUrl: 'https://api',
      projectId: 5,
      projectKey: '5',
    });

    await updateMarkerProjectHint('https://site.example', 7);

    expect(await loadOAuthMarker('https://site.example')).toEqual({
      apiUrl: 'https://api',
      projectId: 7,
      projectKey: '5',
    });
  });

  it('updateMarkerProjectHint is a no-op when the origin has no OAuth marker', async () => {
    await updateMarkerProjectHint('https://never-connected.example', 7);

    expect(await loadOAuthMarker('https://never-connected.example')).toBeNull();
  });

  it('clearMarker removes the origin record', async () => {
    await storeOAuthMarker('https://site.example', {
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });

    await clearMarker('https://site.example');

    expect(await loadOAuthMarker('https://site.example')).toBeNull();
  });
});

describe('isSessionReferencedByAnyOrigin', () => {
  beforeEach(() => store.clear());

  it('is true when another origin marks the same backend and project key connected', async () => {
    await storeOAuthMarker('https://site-b.example', {
      apiUrl: 'https://api',
      projectId: 5,
      projectKey: '5',
    });

    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(true);
  });

  it('is false when no marker references that project key', async () => {
    await storeOAuthMarker('https://site-b.example', {
      apiUrl: 'https://api',
      projectId: 7,
      projectKey: '7',
    });

    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(
      false
    );
  });

  it('ignores a marker for a different backend even with the same project key', async () => {
    await storeOAuthMarker('https://site-b.example', {
      apiUrl: 'https://other-backend.example',
      projectId: 5,
      projectKey: '5',
    });

    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(
      false
    );
  });

  it('is false with no markers at all', async () => {
    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(
      false
    );
  });
});
