import { afterEach, describe, expect, it, vi } from 'vitest';

const launchWebAuthFlow = vi.fn();
vi.mock('webextension-polyfill', () => ({
  default: {
    identity: {
      getRedirectURL: () => 'https://ext.chromiumapp.org/',
      launchWebAuthFlow: (...args: unknown[]) => launchWebAuthFlow(...args),
    },
  },
}));

// Deterministic PKCE so login()'s generated state is predictable ('fixed') and we can craft matching/mismatching
// redirects. The real pkce is covered in pkce.test.ts.
vi.mock('./pkce', () => ({
  randomUrlSafe: () => 'fixed',
  challengeFromVerifier: async () => 'challenge',
}));

import { OAUTH_REFRESH_SKEW_MS } from '../constants';
import {
  login,
  OAuthTokenEndpointError,
  parseTokenResponse,
  refresh,
  wasCancelledByUser,
} from './oauthClient';

const redirect = (query: string) => `https://ext.chromiumapp.org/?${query}`;

afterEach(() => {
  launchWebAuthFlow.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('login happy path', () => {
  it('sends S256 PKCE + project hint on authorize and exchanges the code at the token endpoint', async () => {
    launchWebAuthFlow.mockResolvedValue(redirect('state=fixed&code=abc'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 300,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await login('https://api', 7);
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');

    const authorizeUrl = new URL(
      (launchWebAuthFlow.mock.calls[0][0] as { url: string }).url
    );
    expect(authorizeUrl.pathname).toBe('/oauth2/authorize');
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('code_challenge')).toBe('challenge');
    expect(authorizeUrl.searchParams.get('project')).toBe('7');

    const [tokenUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: URLSearchParams },
    ];
    expect(tokenUrl).toBe('https://api/oauth2/token');
    expect(init.body.get('grant_type')).toBe('authorization_code');
    expect(init.body.get('code')).toBe('abc');
    expect(init.body.get('code_verifier')).toBe('fixed');
    expect(init.body.get('redirect_uri')).toBe('https://ext.chromiumapp.org/');
  });
});

describe('login security gates', () => {
  it('rejects when the returned state does not match the sent one (CSRF)', async () => {
    launchWebAuthFlow.mockResolvedValue(redirect('state=wrong&code=abc'));
    await expect(login('https://api', 1)).rejects.toThrow('unexpected state');
  });

  it('surfaces an error/error_description from the redirect', async () => {
    launchWebAuthFlow.mockResolvedValue(
      redirect(
        'state=fixed&error=access_denied&error_description=User%20denied'
      )
    );
    await expect(login('https://api')).rejects.toThrow('User denied');
  });

  it('rejects a matching-state redirect that carries no code', async () => {
    launchWebAuthFlow.mockResolvedValue(redirect('state=fixed'));
    await expect(login('https://api')).rejects.toThrow('did not return a code');
  });
});

describe('launchAuthWithRetry (via login)', () => {
  it('stops immediately when the user cancels', async () => {
    launchWebAuthFlow.mockRejectedValue(new Error('The user cancelled'));
    await expect(login('https://api')).rejects.toThrow('cancelled');
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(1);
  });

  it('retries a transient load failure before proceeding', async () => {
    vi.useFakeTimers();
    launchWebAuthFlow
      .mockRejectedValueOnce(
        new Error('Authorization page could not be loaded')
      )
      .mockRejectedValueOnce(
        new Error('Authorization page could not be loaded')
      )
      .mockResolvedValueOnce(redirect('state=wrong&code=abc'));
    const p = login('https://api');
    const assertion = expect(p).rejects.toThrow('unexpected state');
    await vi.runAllTimersAsync();
    await assertion;
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(3);
  });

  it('gives up after the max attempts of consecutive transient failures', async () => {
    vi.useFakeTimers();
    launchWebAuthFlow.mockRejectedValue(
      new Error('Authorization page could not be loaded')
    );
    const p = login('https://api');
    const assertion = expect(p).rejects.toThrow('could not be loaded');
    await vi.runAllTimersAsync();
    await assertion;
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(3);
  });
});

describe('postToken error contract', () => {
  it('rejects with OAuthTokenEndpointError carrying the status on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      }))
    );
    const err = await refresh('https://api', 'rt').catch((e) => e);
    expect(err).toBeInstanceOf(OAuthTokenEndpointError);
    expect(err.status).toBe(400);
  });
});

describe('refresh', () => {
  it('builds the refresh_token grant request with the token and client_id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'a2',
        refresh_token: 'r2',
        expires_in: 300,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await refresh('https://api', 'r1');
    expect(tokens.accessToken).toBe('a2');
    expect(tokens.refreshToken).toBe('r2');

    const [tokenUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: URLSearchParams },
    ];
    expect(tokenUrl).toBe('https://api/oauth2/token');
    expect(init.body.get('grant_type')).toBe('refresh_token');
    expect(init.body.get('refresh_token')).toBe('r1');
    expect(init.body.get('client_id')).toBeTruthy();
  });
});

describe('parseTokenResponse', () => {
  it('rotates the refresh token when the response carries a new one', () => {
    const t = parseTokenResponse(
      { access_token: 'a2', refresh_token: 'r2', expires_in: 300 },
      'r1'
    );
    expect(t.accessToken).toBe('a2');
    expect(t.refreshToken).toBe('r2');
  });

  it('keeps the previous refresh token when the response omits one', () => {
    const t = parseTokenResponse({ access_token: 'a2', expires_in: 300 }, 'r1');
    expect(t.refreshToken).toBe('r1');
  });

  it('falls back to a 7-minute lifetime when expires_in is missing or non-positive', () => {
    const before = Date.now();
    const t = parseTokenResponse({ access_token: 'a2' }, 'r1');
    expect(t.expiresAt).toBeGreaterThanOrEqual(before + 7 * 60 * 1000);
    expect(t.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * 60 * 1000 + 1000);

    const zero = parseTokenResponse(
      { access_token: 'a2', expires_in: 0 },
      'r1'
    );
    expect(zero.expiresAt).toBeGreaterThan(Date.now() + 6 * 60 * 1000);
  });

  it('the fallback lifetime always exceeds the refresh skew, so a defaulted token is never stale on arrival', () => {
    const t = parseTokenResponse({ access_token: 'a2' }, 'r1');
    expect(t.expiresAt - OAUTH_REFRESH_SKEW_MS).toBeGreaterThan(Date.now());
  });

  it('throws when the response has no access token', () => {
    expect(() => parseTokenResponse({ refresh_token: 'r2' }, 'r1')).toThrow();
    expect(() => parseTokenResponse({ access_token: '' }, 'r1')).toThrow();
  });
});

describe('wasCancelledByUser', () => {
  it('matches user-cancellation messages', () => {
    for (const m of [
      'The user cancelled the flow',
      'User did not approve access',
      'Authorization was denied',
      'Window closed by the user',
    ]) {
      expect(wasCancelledByUser(m)).toBe(true);
    }
  });

  it('does not match transient load failures', () => {
    expect(wasCancelledByUser('Authorization page could not be loaded')).toBe(
      false
    );
    expect(wasCancelledByUser('network error')).toBe(false);
  });
});
