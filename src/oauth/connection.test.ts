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
  clearConnection,
  isSessionReferencedByAnyOrigin,
  loadConnectionForTeardown,
  loadOriginConnection,
  storeOAuthConnection,
  updateConnectionHints,
} from './connection';

describe('OAuth connection', () => {
  beforeEach(() => store.clear());

  it('round-trips apiUrl, projectId and the authoritative projectKey', async () => {
    await storeOAuthConnection('https://site.example', {
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });
    expect(await loadConnectionForTeardown('https://site.example')).toEqual({
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });
  });

  it('returns null when no connection exists for the origin', async () => {
    expect(await loadConnectionForTeardown('https://none.example')).toBeNull();
  });

  it('returns null for a non-oauth record (e.g. an api-key entry)', async () => {
    store.set('https://k.example', { apiUrl: 'https://api', apiKey: 'x' });
    expect(await loadConnectionForTeardown('https://k.example')).toBeNull();
  });

  it('updateConnectionHints updates only projectId and branch, leaving projectKey (the session identity) untouched', async () => {
    await storeOAuthConnection('https://site.example', {
      apiUrl: 'https://api',
      projectId: 5,
      projectKey: '5',
    });

    await updateConnectionHints('https://site.example', {
      projectId: 7,
      branch: 'feature',
    });

    expect(await loadConnectionForTeardown('https://site.example')).toEqual({
      apiUrl: 'https://api',
      projectId: 7,
      projectKey: '5',
    });
  });

  it('updateConnectionHints is a no-op when the origin has no OAuth connection', async () => {
    await updateConnectionHints('https://never-connected.example', {
      projectId: 7,
      branch: undefined,
    });

    expect(
      await loadConnectionForTeardown('https://never-connected.example')
    ).toBeNull();
  });

  it('clearConnection removes the origin record', async () => {
    await storeOAuthConnection('https://site.example', {
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });

    await clearConnection('https://site.example');

    expect(await loadConnectionForTeardown('https://site.example')).toBeNull();
  });
});

describe('isSessionReferencedByAnyOrigin', () => {
  beforeEach(() => store.clear());

  it('is true when another origin marks the same backend and project key connected', async () => {
    await storeOAuthConnection('https://site-b.example', {
      apiUrl: 'https://api',
      projectId: 5,
      projectKey: '5',
    });

    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(true);
  });

  it('is false when no connection references that project key', async () => {
    await storeOAuthConnection('https://site-b.example', {
      apiUrl: 'https://api',
      projectId: 7,
      projectKey: '7',
    });

    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(
      false
    );
  });

  it('ignores a connection for a different backend even with the same project key', async () => {
    await storeOAuthConnection('https://site-b.example', {
      apiUrl: 'https://other-backend.example',
      projectId: 5,
      projectKey: '5',
    });

    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(
      false
    );
  });

  it('is false with no connections at all', async () => {
    expect(await isSessionReferencedByAnyOrigin('https://api', '5')).toBe(
      false
    );
  });
});

describe('loadOriginConnection', () => {
  beforeEach(() => store.clear());

  it('reports an OAuth connection by kind, without any credential', async () => {
    await storeOAuthConnection('https://site.example', {
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });
    expect(await loadOriginConnection('https://site.example')).toEqual({
      kind: 'oauth',
      apiUrl: 'https://api',
      projectId: 2,
      projectKey: '2',
    });
  });

  it('reports an api-key record by kind, with the key the worker holds and the project it is pinned to', async () => {
    store.set('https://site.example', {
      apiUrl: 'https://api',
      apiKey: 'tgpak_x',
      branch: 'feat',
      siteKey: 'tgpak_site',
      projectId: 3,
      projectKey: '3',
    });
    expect(await loadOriginConnection('https://site.example')).toEqual({
      kind: 'apiKey',
      apiUrl: 'https://api',
      apiKey: 'tgpak_x',
      projectId: 3,
      projectKey: '3',
    });
  });

  it('is null for an api-key record without a project pin, and for no record at all', async () => {
    store.set('https://site.example', { apiUrl: 'https://api', apiKey: 'x' });
    expect(await loadOriginConnection('https://site.example')).toBeNull();
    expect(await loadOriginConnection('https://none.example')).toBeNull();
  });
});
