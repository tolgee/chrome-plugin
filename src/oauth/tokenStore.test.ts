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
  clearSessionByKey,
  ensureFreshToken,
  loadSession,
  refreshAfterRejection,
  saveSession,
} from './tokenStore';

const URL_A = 'https://app.tolgee.io';
const future = () => Date.now() + 60 * 60 * 1000;

const tokens = (
  label: string,
  overrides: Partial<{ refreshToken: string; expiresAt: number }> = {}
) => ({
  accessToken: `token-${label}`,
  refreshToken: 'refresh',
  expiresAt: future(),
  ...overrides,
});

const getValidAccessToken = async (
  apiUrl: string,
  projectId: number
): Promise<string | null> => {
  const session = await loadSession(apiUrl, projectId);
  if (!session) {
    return null;
  }
  const fresh = await ensureFreshToken(session);
  return 'accessToken' in fresh ? fresh.accessToken : null;
};

describe('tokenStore per-project keying', () => {
  beforeEach(() => {
    store.clear();
    refresh.mockReset();
  });

  it('saveSession returns the exact record it persisted, so a caller need not re-derive it', async () => {
    const t = tokens('5');
    const saved = await saveSession(URL_A, t, 5);

    expect(saved).toEqual({ ...t, apiUrl: URL_A, projectKey: '5' });
    expect(await loadSession(URL_A, 5)).toEqual(saved);
  });

  it('keeps two concrete-project sessions on the same backend from colliding', async () => {
    await saveSession(URL_A, tokens('2'), 2);
    await saveSession(URL_A, tokens('3'), 3);

    expect((await loadSession(URL_A, 2))?.accessToken).toBe('token-2');
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
  });

  it("connecting a second project on the same backend never reuses the first project's session", async () => {
    await saveSession(URL_A, tokens('5'), 5);

    expect(await getValidAccessToken(URL_A, 7)).toBeNull();
  });

  it('shares one in-flight refresh across concurrent reads (no single-use double-spend)', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }), 3);
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

  it('clears only the session under the given key', async () => {
    await saveSession(URL_A, tokens('2'), 2);
    await saveSession(URL_A, tokens('3'), 3);

    await clearSessionByKey(URL_A, '2');

    expect(await loadSession(URL_A, 2)).toBeNull();
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
  });

  it('refresh keeps the session under its original project key regardless of the new access token', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }), 3);
    refresh.mockResolvedValue({
      accessToken: 'token-refreshed',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    const token = await getValidAccessToken(URL_A, 3);

    expect(token).toBe('token-refreshed');
    expect((await loadSession(URL_A, 3))?.projectKey).toBe('3');
    expect((await loadSession(URL_A, 3))?.refreshToken).toBe('r2');
  });

  it('does not refresh a still-valid token', async () => {
    await saveSession(URL_A, tokens('3'), 3);

    expect(await getValidAccessToken(URL_A, 3)).toBe('token-3');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes a token inside the refresh-skew window (proactive refresh)', async () => {
    await saveSession(
      URL_A,
      tokens('3', { expiresAt: Date.now() + 30_000 }),
      3
    );
    refresh.mockResolvedValueOnce({
      accessToken: 'token-3b',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    expect(await getValidAccessToken(URL_A, 3)).toBe('token-3b');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ensureFreshToken re-reads current state, so a stale expired snapshot never double-spends the refresh token', async () => {
    await saveSession(URL_A, tokens('3'), 3);
    const staleSnapshot = {
      accessToken: 'token-3-old',
      refreshToken: 'r0',
      expiresAt: Date.now() - 1,
      apiUrl: URL_A,
      projectKey: '3',
    };

    expect(await ensureFreshToken(staleSnapshot)).toEqual({
      accessToken: 'token-3',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a refresh completing after a concurrent Disconnect does not resurrect the removed session', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }), 3);
    let resolveRefresh: (v: unknown) => void = () => {};
    refresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const pending = getValidAccessToken(URL_A, 3);
    await new Promise((r) => setTimeout(r, 0));
    await clearSessionByKey(URL_A, '3');
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
      tokens('3', { expiresAt: Date.now() - 1, refreshToken: 'old-refresh' }),
      3
    );
    let resolveRefresh: (v: unknown) => void = () => {};
    refresh.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const pending = getValidAccessToken(URL_A, 3);
    await new Promise((r) => setTimeout(r, 0));
    await saveSession(URL_A, tokens('3', { refreshToken: 'new-refresh' }), 3);
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

  it('clears an expired session that has no refresh token, without calling refresh', async () => {
    await saveSession(
      URL_A,
      tokens('3', { refreshToken: undefined, expiresAt: Date.now() - 1 }),
      3
    );

    expect(await getValidAccessToken(URL_A, 3)).toBeNull();
    expect(await loadSession(URL_A, 3)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('answers session_ended and clears the session when refresh fails with a terminal 400/401 (dead refresh token)', async () => {
    for (const status of [400, 401]) {
      store.clear();
      const session = await saveSession(
        URL_A,
        tokens('3', { expiresAt: Date.now() - 1 }),
        3
      );
      refresh.mockReset();
      refresh.mockRejectedValue(endpointError(status));

      expect(await ensureFreshToken(session)).toEqual({
        failure: 'session_ended',
      });
      expect(await loadSession(URL_A, 3)).toBeNull();
    }
  });

  it('answers refresh_failed and keeps the session when refresh fails transiently (403/404/429/503/network)', async () => {
    for (const err of [
      endpointError(403),
      endpointError(404),
      endpointError(429),
      endpointError(503),
      new Error('network error'),
    ]) {
      store.clear();
      const session = await saveSession(
        URL_A,
        tokens('3', { expiresAt: Date.now() - 1 }),
        3
      );
      refresh.mockReset();
      refresh.mockRejectedValue(err);

      expect(await ensureFreshToken(session)).toEqual({
        failure: 'refresh_failed',
      });
      // The token is kept so a later call can retry rather than logging the user out on a blip.
      expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
    }
  });

  it('clears the in-flight entry after settling so a later expiry refreshes again', async () => {
    await saveSession(URL_A, tokens('3', { expiresAt: Date.now() - 1 }), 3);
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
});

describe('refreshAfterRejection', () => {
  beforeEach(() => {
    store.clear();
    refresh.mockReset();
  });

  it('refreshes a locally-fresh token the server rejected (grant revoked), bypassing the freshness check', async () => {
    const session = await saveSession(URL_A, tokens('3'), 3);
    refresh.mockResolvedValue({
      accessToken: 'token-3b',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    expect(await refreshAfterRejection(session, 'token-3')).toEqual({
      accessToken: 'token-3b',
    });
    expect(refresh).toHaveBeenCalledWith(URL_A, 'refresh');
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3b');
  });

  it('returns the current token without a network call when a sibling already rotated the session', async () => {
    const stale = await saveSession(URL_A, tokens('3'), 3);
    await saveSession(URL_A, tokens('3-rotated'), 3);

    expect(await refreshAfterRejection(stale, 'token-3')).toEqual({
      accessToken: 'token-3-rotated',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('joins an in-flight refresh instead of spending the refresh token twice', async () => {
    const session = await saveSession(
      URL_A,
      tokens('3', { expiresAt: Date.now() - 1 }),
      3
    );
    let resolveRefresh!: (v: unknown) => void;
    refresh.mockReturnValue(new Promise((res) => (resolveRefresh = res)));

    const viaExpiry = ensureFreshToken(session);
    const viaRejection = refreshAfterRejection(session, 'token-3');
    await new Promise((r) => setTimeout(r, 0));
    resolveRefresh({
      accessToken: 'token-3b',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    expect(await Promise.all([viaExpiry, viaRejection])).toEqual([
      { accessToken: 'token-3b' },
      { accessToken: 'token-3b' },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('answers session_ended and clears the session when the refresh token is dead', async () => {
    const session = await saveSession(URL_A, tokens('3'), 3);
    refresh.mockRejectedValue(endpointError(401));

    expect(await refreshAfterRejection(session, 'token-3')).toEqual({
      failure: 'session_ended',
    });
    expect(await loadSession(URL_A, 3)).toBeNull();
  });

  it('answers refresh_failed, keeping the session, when the refresh fails transiently', async () => {
    const session = await saveSession(URL_A, tokens('3'), 3);
    refresh.mockRejectedValue(endpointError(503));

    expect(await refreshAfterRejection(session, 'token-3')).toEqual({
      failure: 'refresh_failed',
    });
    expect((await loadSession(URL_A, 3))?.accessToken).toBe('token-3');
  });

  it('answers session_ended for a session that is gone or has no refresh token', async () => {
    const gone = { ...tokens('3'), apiUrl: URL_A, projectKey: '3' };
    expect(await refreshAfterRejection(gone, 'token-3')).toEqual({
      failure: 'session_ended',
    });

    const session = await saveSession(
      URL_A,
      tokens('3', { refreshToken: undefined }),
      3
    );
    expect(await refreshAfterRejection(session, 'token-3')).toEqual({
      failure: 'session_ended',
    });
    expect(await loadSession(URL_A, 3)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
