import browser from 'webextension-polyfill';
import { OAUTH_REFRESH_SKEW_MS } from '../constants';
import { OAuthTokens, refresh } from './oauthClient';

export type StoredSession = OAuthTokens & { apiUrl: string };

// Sessions are keyed by the Tolgee backend origin, so one login is reused across every page that targets it.
const keyFor = (apiUrl: string) => `oauth:${new URL(apiUrl).origin}`;

export const saveSession = async (apiUrl: string, tokens: OAuthTokens) => {
  await browser.storage.local.set({ [keyFor(apiUrl)]: { ...tokens, apiUrl } });
};

export const loadSession = async (
  apiUrl: string
): Promise<StoredSession | null> => {
  const key = keyFor(apiUrl);
  const stored = await browser.storage.local.get(key);
  return (stored[key] as StoredSession) ?? null;
};

export const clearSession = async (apiUrl: string) => {
  await browser.storage.local.remove(keyFor(apiUrl));
};

export const loadAllSessions = async (): Promise<StoredSession[]> => {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith('oauth:'))
    .map(([, value]) => value as StoredSession);
};

// A token-endpoint 4xx means the refresh token is dead (rotated away or revoked) — terminal, clear the session. A
// network failure (fetch rejects, no status) is transient — keep the session so a later call can retry instead of
// logging the user out on a blip. postToken throws `... returned <status>: ...` for non-ok responses.
const isTerminalRefreshFailure = (e: unknown) =>
  e instanceof Error && /returned 4\d\d/.test(e.message);

// A refresh rotates the refresh token, so two concurrent refreshes for the same backend would both spend the same
// (single-use) token: the first wins, the second gets invalid_grant and clears the just-refreshed session. The alarm
// handler and an OAUTH_GET_TOKEN message can land in the same worker at once, so share one in-flight refresh per origin.
const inFlightRefresh = new Map<string, Promise<string | null>>();

const refreshSession = async (
  apiUrl: string,
  refreshToken: string
): Promise<string | null> => {
  try {
    const refreshed = await refresh(apiUrl, refreshToken);
    await saveSession(apiUrl, refreshed);
    return refreshed.accessToken;
  } catch (e) {
    if (isTerminalRefreshFailure(e)) {
      await clearSession(apiUrl);
    }
    return null;
  }
};

// Returns a valid access token, refreshing (and persisting) if it is expired or near expiry.
// Returns null (and clears the session) when there is nothing valid to fall back on — the caller must re-login.
export const getValidAccessToken = async (
  apiUrl: string
): Promise<string | null> => {
  const session = await loadSession(apiUrl);
  if (!session) {
    return null;
  }
  if (session.expiresAt - OAUTH_REFRESH_SKEW_MS > Date.now()) {
    return session.accessToken;
  }
  if (!session.refreshToken) {
    await clearSession(apiUrl);
    return null;
  }
  const key = keyFor(apiUrl);
  const existing = inFlightRefresh.get(key);
  if (existing) {
    return existing;
  }
  const pending = refreshSession(apiUrl, session.refreshToken).finally(() =>
    inFlightRefresh.delete(key)
  );
  inFlightRefresh.set(key, pending);
  return pending;
};
