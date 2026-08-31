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
  scopeServesProject: (
    projectKey: string | undefined,
    pageProjectId: string | null
  ) =>
    projectKey === undefined ||
    projectKey === '*' ||
    (pageProjectId !== null && projectKey.split(',').includes(pageProjectId)),
}));

const { refresh, OAuthTokenEndpointError } = vi.hoisted(() => {
  class OAuthTokenEndpointError extends Error {
    constructor(readonly status: number) {
      super(`Tolgee token endpoint returned ${status}`);
    }
  }
  return { refresh: vi.fn(), OAuthTokenEndpointError };
});
vi.mock('./oauthClient', () => ({
  OAuthTokenEndpointError,
  refresh: (apiUrl: string, refreshToken: string) =>
    refresh(apiUrl, refreshToken),
}));

// A token-endpoint error, matching how isTerminalRefreshFailure classifies (instanceof + status).
const endpointError = (status: number) => new OAuthTokenEndpointError(status);

import {
  clearSession,
  clearSessionForToken,
  clearSessionIfUnreferenced,
  ensureFreshToken,
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

  it('with the reopen fallback, serves the sole origin session when the project is unknown', async () => {
    // The popup reopens and asks with no projectId before it re-resolves the page's project. With a single session for
    // the backend, the opt-in fallback must still resolve it — otherwise the popup treats it as disconnected and wipes it.
    await saveSession(URL_A, tokens('2'));
    const opts = { soleOriginFallback: true };

    expect(await getValidAccessToken(URL_A, undefined, opts)).toBe('token-2');
    // A concrete projectId the sole session serves still resolves (via loadSession's exact match).
    expect(await getValidAccessToken(URL_A, 2, opts)).toBe('token-2');
  });

  it('does not serve the sole session for a concrete project its scope does not cover', async () => {
    // Guards against injecting a project-2 token into a page bound to project 999 just because it is the only session.
    await saveSession(URL_A, tokens('2'));

    expect(
      await getValidAccessToken(URL_A, 999, { soleOriginFallback: true })
    ).toBeNull();
  });

  it('is strict by default: a mismatched concrete project does not reuse the sole session', async () => {
    // connect()/OAUTH_LOGIN use the default (strict) so a page declaring a different project runs a fresh login for it
    // instead of silently reusing a wrong-scoped token.
    await saveSession(URL_A, tokens('2'));

    expect(await getValidAccessToken(URL_A, 999)).toBeNull();
  });

  it('does not guess when multiple sessions exist and no project matches', async () => {
    await saveSession(URL_A, tokens('2'));
    await saveSession(URL_A, tokens('3'));

    expect(
      await getValidAccessToken(URL_A, undefined, { soleOriginFallback: true })
    ).toBeNull();
  });

  it('shares one in-flight refresh across concurrent reads (no single-use double-spend)', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }));
    let resolveRefresh!: (v: unknown) => void;
    const deferred = new Promise((res) => (resolveRefresh = res));
    refresh.mockReturnValue(deferred);

    const p1 = getValidAccessToken(URL_A, 3);
    const p2 = getValidAccessToken(URL_A, 3);
    // Let both reads get past their (async) session load and dedup onto the one shared refresh before it resolves.
    await new Promise((r) => setTimeout(r, 0));
    resolveRefresh({
      accessToken: 'token-3b',
      refreshToken: 'r2',
      expiresAt: future(),
    });
    const [a, b] = await Promise.all([p1, p2]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a).toBe('token-3b');
    expect(b).toBe('token-3b');
  });

  it('clears only the session serving the given project', async () => {
    await saveSession(URL_A, tokens('2'));
    await saveSession(URL_A, tokens('3'));

    await clearSession(URL_A, 2);

    expect(await loadSession(URL_A, 2)).toBeNull();
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
  });

  it('clearSession is strict: disconnecting a non-served concrete project is a no-op', async () => {
    // The disconnect half of 8a3d045: clearSession must not delete the wrong session when the project doesn't match.
    await saveSession(URL_A, tokens('2'));

    await clearSession(URL_A, 999);

    expect((await loadSession(URL_A, 2))?.accessToken).toBe('token-2');
    expect(await loadSession(URL_A, 999)).toBeNull();
  });

  it('a multi-project-keyed session is reachable by a member project via membership match', async () => {
    // Multi-project tokens are never minted by the extension; this pins the store behavior if one ever appeared: the
    // read path matches by membership (like scopeServesProject), so the session auto-refreshes for its member projects.
    await saveSession(URL_A, tokens('5,7'));

    expect((await loadSession(URL_A, 5))?.accessToken).toBe('token-5,7');
    expect((await loadSession(URL_A, 7))?.accessToken).toBe('token-5,7');
    expect(await loadSession(URL_A, 9)).toBeNull();
    expect(await getValidAccessToken(URL_A, 5)).toBe('token-5,7');
  });

  it('disconnecting one project drops the shared all-projects session (documented)', async () => {
    // With only an all-projects session, clearSession for any project resolves to and removes that shared '*' session —
    // so every other project relying on it is disconnected too. Intended: an all-projects login is one shared session.
    await saveSession(URL_A, tokens('*'));

    await clearSession(URL_A, 5);

    expect(await loadSession(URL_A, 7)).toBeNull();
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

  it('refreshes a token inside the refresh-skew window (proactive refresh)', async () => {
    // 30s to expiry is inside the 60s skew, so it must refresh proactively rather than serve the near-dead token.
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() + 30_000 }));
    refresh.mockResolvedValueOnce({
      accessToken: 'token-3b',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    expect(await getValidAccessToken(URL_A, 3)).toBe('token-3b');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ensureFreshToken re-reads current state, so a stale expired snapshot never double-spends the refresh token', async () => {
    // The alarm captures a snapshot then acts on it later; if a concurrent refresh rotated the token in between, the
    // snapshot is stale. ensureFreshToken must re-read and serve the current fresh token, not refresh the stale one.
    await saveSession(URL_A, tokens('3'));
    const staleSnapshot = {
      accessToken: 'token-3-old',
      refreshToken: 'r0',
      expiresAt: Date.now() - 1,
      apiUrl: URL_A,
      projectKey: '3',
    };

    expect(await ensureFreshToken(staleSnapshot)).toBe('token-3');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a refresh completing after a concurrent Disconnect does not resurrect the removed session', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }));
    let resolveRefresh: (v: unknown) => void = () => {};
    refresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const pending = getValidAccessToken(URL_A, 3);
    await new Promise((r) => setTimeout(r, 0));
    await clearSessionForToken(URL_A, 'token-3');
    resolveRefresh({
      accessToken: 'token-3-new',
      refreshToken: 'r2',
      expiresAt: future(),
    });
    await pending;

    expect(await loadSession(URL_A, 3)).toBeNull();
  });

  it('a refresh completing after a concurrent reconnect does not clobber the reconnected session', async () => {
    await saveSession(
      URL_A,
      tokens('3', { expiresAt: Date.now() - 1, refreshToken: 'old-refresh' })
    );
    let resolveRefresh: (v: unknown) => void = () => {};
    refresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const pending = getValidAccessToken(URL_A, 3);
    await new Promise((r) => setTimeout(r, 0));
    await saveSession(URL_A, tokens('3', { refreshToken: 'new-refresh' }));
    resolveRefresh({
      accessToken: 'token-3-stale',
      refreshToken: 'rotated',
      expiresAt: future(),
    });

    // Serves the reconnected token, never the orphan it declined to store (else the alarm would push a stale token).
    expect(await pending).toBe('token-3');
    const current = await loadSession(URL_A, 3);
    expect(current?.refreshToken).toBe('new-refresh');
    expect(current?.accessToken).toBe('token-3');
  });

  it('clearSessionForToken deletes exactly the session the token owns (multi-project key)', async () => {
    await saveSession(URL_A, tokens('5,7'));

    await clearSessionForToken(URL_A, 'token-5,7');

    expect(
      await getValidAccessToken(URL_A, undefined, { soleOriginFallback: true })
    ).toBeNull();
  });

  it('clearSessionIfUnreferenced keeps a shared session that another site still marks connected', async () => {
    await saveSession(URL_A, tokens('*'));
    const marker = { oauth: true, apiUrl: URL_A, projectKey: '*' };
    store.set('https://site-a.example', marker);
    store.set('https://site-b.example', marker);

    await clearSessionIfUnreferenced(URL_A, '*', 'https://site-a.example');

    expect((await loadSession(URL_A, 7))?.accessToken).toBe('token-*');
  });

  it('clearSessionIfUnreferenced deletes the session when the disconnecting site was the last reference', async () => {
    await saveSession(URL_A, tokens('*'));
    store.set('https://site-a.example', {
      oauth: true,
      apiUrl: URL_A,
      projectKey: '*',
    });

    await clearSessionIfUnreferenced(URL_A, '*', 'https://site-a.example');

    expect(await loadSession(URL_A, 7)).toBeNull();
  });

  it('clears an expired session that has no refresh token, without calling refresh', async () => {
    await saveSession(
      URL_A,
      tokens('3', { refreshToken: undefined, expiresAt: Date.now() - 1 })
    );

    expect(await getValidAccessToken(URL_A, 3)).toBeNull();
    expect(await loadSession(URL_A, 3)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('clears the session when refresh fails with a terminal 400/401 (dead refresh token)', async () => {
    for (const status of [400, 401]) {
      store.clear();
      await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }));
      refresh.mockReset();
      refresh.mockRejectedValue(endpointError(status));

      expect(await getValidAccessToken(URL_A, 3)).toBeNull();
      expect(await loadSession(URL_A, 3)).toBeNull();
    }
  });

  it('keeps the session when refresh fails transiently (403/404/429/503/network)', async () => {
    for (const err of [
      endpointError(403),
      endpointError(404),
      endpointError(429),
      endpointError(503),
      new Error('network error'),
    ]) {
      store.clear();
      await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }));
      refresh.mockReset();
      refresh.mockRejectedValue(err);

      expect(await getValidAccessToken(URL_A, 3)).toBeNull();
      // The token is kept so a later call can retry rather than logging the user out on a blip.
      expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
    }
  });

  it('clears the in-flight entry after settling so a later expiry refreshes again', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }));
    refresh.mockResolvedValueOnce({
      accessToken: 'token-3b',
      refreshToken: 'r2',
      expiresAt: future(),
    });
    expect(await getValidAccessToken(URL_A, 3)).toBe('token-3b');

    // Force the just-refreshed session expired again; a second read must run a fresh refresh (not serve a stale
    // cached in-flight promise).
    const s = store.get('oauth:https://app.tolgee.io:3') as {
      expiresAt: number;
    };
    s.expiresAt = Date.now() - 1;
    refresh.mockResolvedValueOnce({
      accessToken: 'token-3c',
      refreshToken: 'r3',
      expiresAt: future(),
    });
    expect(await getValidAccessToken(URL_A, 3)).toBe('token-3c');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('resolves the right sole session per origin when connected to two backends', async () => {
    const URL_B = 'https://other.example';
    const fallback = { soleOriginFallback: true };
    await saveSession(URL_A, tokens('2'));
    await saveSession(URL_B, tokens('9'));

    expect(await getValidAccessToken(URL_A, undefined, fallback)).toBe(
      'token-2'
    );
    expect(await getValidAccessToken(URL_B, undefined, fallback)).toBe(
      'token-9'
    );
  });
});
