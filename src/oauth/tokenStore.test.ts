import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory chrome.storage.local.
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
        set: async (obj: Record<string, unknown>) => {
          Object.entries(obj).forEach(([k, v]) => store.set(k, v));
        },
        remove: async (key: string) => {
          store.delete(key);
        },
      },
    },
  },
}));

// The scope key is taken verbatim from the token string ('token-3' -> '3', 'token-*' -> '*'), so tests control it.
vi.mock('./tokenScope', () => ({
  ALL_PROJECTS_KEY: '*',
  projectKeyForToken: (token: string) => token.replace(/^token-/, ''),
}));

const refresh = vi.fn();
vi.mock('./oauthClient', () => ({
  refresh: (apiUrl: string, refreshToken: string) =>
    refresh(apiUrl, refreshToken),
}));

import {
  clearSession,
  getValidAccessToken,
  loadSession,
  saveSession,
} from './tokenStore';

const URL_A = 'https://app.tolgee.io';
const future = () => Date.now() + 60 * 60 * 1000;

const tokens = (
  scope: string,
  overrides: Partial<{ refreshToken: string; expiresAt: number }> = {}
) => ({
  accessToken: `token-${scope}`,
  refreshToken: 'refresh',
  expiresAt: future(),
  ...overrides,
});

describe('tokenStore per-project keying', () => {
  beforeEach(() => {
    store.clear();
    refresh.mockReset();
  });

  it('keeps two concrete-project sessions on the same backend from colliding', async () => {
    await saveSession(URL_A, tokens('2'));
    await saveSession(URL_A, tokens('3'));

    expect((await loadSession(URL_A, 2))?.accessToken).toBe('token-2');
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
  });

  it('serves any project from an all-projects session when no concrete one exists', async () => {
    await saveSession(URL_A, tokens('*'));

    expect((await loadSession(URL_A, 7))?.projectKey).toBe('*');
    expect((await loadSession(URL_A, 99))?.accessToken).toBe('token-*');
  });

  it('prefers a concrete session over an all-projects one for its own project', async () => {
    await saveSession(URL_A, tokens('*'));
    await saveSession(URL_A, tokens('3'));

    expect((await loadSession(URL_A, 3))?.projectKey).toBe('3');
    expect((await loadSession(URL_A, 5))?.projectKey).toBe('*');
  });

  it('clears only the session serving the given project', async () => {
    await saveSession(URL_A, tokens('2'));
    await saveSession(URL_A, tokens('3'));

    await clearSession(URL_A, 2);

    expect(await loadSession(URL_A, 2)).toBeNull();
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
  });

  it('refreshes under the original scope key, not the refreshed token’s', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }));
    // The backend never widens scope on refresh, but even if the refreshed token decoded differently the session must
    // stay keyed by '3' so the concrete lookup keeps finding it.
    refresh.mockResolvedValue({
      accessToken: 'token-*',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    const token = await getValidAccessToken(URL_A, 3);

    expect(token).toBe('token-*');
    expect((await loadSession(URL_A, 3))?.projectKey).toBe('3');
    expect((await loadSession(URL_A, 3))?.refreshToken).toBe('r2');
  });

  it('does not refresh a still-valid token', async () => {
    await saveSession(URL_A, tokens('3'));

    expect(await getValidAccessToken(URL_A, 3)).toBe('token-3');
    expect(refresh).not.toHaveBeenCalled();
  });
});
