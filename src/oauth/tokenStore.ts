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
  try {
    const refreshed = await refresh(apiUrl, session.refreshToken);
    await saveSession(apiUrl, refreshed);
    return refreshed.accessToken;
  } catch (e) {
    await clearSession(apiUrl);
    return null;
  }
};
