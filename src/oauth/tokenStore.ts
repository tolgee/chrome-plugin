import browser from 'webextension-polyfill';
import { OAUTH_REFRESH_SKEW_MS } from '../constants';
import { OAuthTokenEndpointError, OAuthTokens, refresh } from './oauthClient';
import { projectKeyFor } from './sessionRules';
import { originOf } from './url';

export type StoredSession = OAuthTokens & {
  apiUrl: string;
  projectKey: string;
};

export const isTokenFresh = (session: Pick<StoredSession, 'expiresAt'>) =>
  session.expiresAt - OAUTH_REFRESH_SKEW_MS > Date.now();

export const saveSession = async (
  apiUrl: string,
  tokens: OAuthTokens,
  projectId: number | string
): Promise<StoredSession> => {
  const projectKey = projectKeyFor(projectId);
  await persist(apiUrl, tokens, projectKey);
  return { ...tokens, apiUrl, projectKey };
};

export const loadSession = (
  apiUrl: string,
  projectId: number
): Promise<StoredSession | null> => loadByKey(apiUrl, projectKeyFor(projectId));

export const clearSessionByKey = (apiUrl: string, projectKey: string) =>
  browser.storage.local.remove(keyFor(apiUrl, projectKey));

export const sessionKey = (session: StoredSession) =>
  keyFor(session.apiUrl, session.projectKey);

export const resolveSessionForTab = (tab: {
  apiUrl: string;
  projectKey: string;
}) => loadByKey(tab.apiUrl, tab.projectKey);

export const ensureFreshToken = async (
  session: StoredSession
): Promise<string | null> => {
  if (isTokenFresh(session)) {
    return session.accessToken;
  }
  const key = sessionKey(session);
  const existing = inFlightRefresh.get(key);
  if (existing) {
    return existing;
  }
  const pending = refreshCurrent(session, key).finally(() =>
    inFlightRefresh.delete(key)
  );
  inFlightRefresh.set(key, pending);
  return pending;
};

// A 401 on a locally-fresh token is the grant-revoked case, so this bypasses isTokenFresh: routing it through
// ensureFreshToken would hand the same rejected token straight back. A sibling request that already rotated the
// session is honoured without a network call, so a late 401 can never clobber its rotation.
export const refreshAfterRejection = (
  session: StoredSession,
  rejectedAccessToken: string
): Promise<string | null> => {
  const key = sessionKey(session);
  const existing = inFlightRefresh.get(key);
  if (existing) {
    return existing;
  }
  const pending = (async () => {
    const current = await loadByKey(session.apiUrl, session.projectKey);
    if (!current) {
      return null;
    }
    if (current.accessToken !== rejectedAccessToken) {
      return current.accessToken;
    }
    if (!current.refreshToken) {
      await browser.storage.local.remove(key);
      return null;
    }
    return refreshSession(current);
  })().finally(() => inFlightRefresh.delete(key));
  inFlightRefresh.set(key, pending);
  return pending;
};

// Re-read at refresh time: the caller may hold a stale snapshot, so a rotated single-use refresh token isn't double-spent.
const refreshCurrent = async (
  session: StoredSession,
  key: string
): Promise<string | null> => {
  const current = await loadByKey(session.apiUrl, session.projectKey);
  if (!current) {
    return null;
  }
  if (isTokenFresh(current)) {
    return current.accessToken;
  }
  if (!current.refreshToken) {
    await browser.storage.local.remove(key);
    return null;
  }
  return refreshSession(current);
};

const persist = async (
  apiUrl: string,
  tokens: OAuthTokens,
  projectKey: string
) => {
  await browser.storage.local.set({
    [keyFor(apiUrl, projectKey)]: { ...tokens, apiUrl, projectKey },
  });
};

const loadByKey = async (
  apiUrl: string,
  projectKey: string
): Promise<StoredSession | null> => {
  const key = keyFor(apiUrl, projectKey);
  const stored = await browser.storage.local.get(key);
  return (stored[key] as StoredSession) ?? null;
};

// One in-flight refresh per key: refresh tokens are single-use, so a concurrent second refresh gets invalid_grant.
const inFlightRefresh = new Map<string, Promise<string | null>>();

const refreshSession = async (
  session: StoredSession
): Promise<string | null> => {
  const spentRefreshToken = session.refreshToken!;
  try {
    const refreshed = await refresh(session.apiUrl, spentRefreshToken);
    // A Disconnect or reconnect can land during the network round-trip.
    const current = await loadByKey(session.apiUrl, session.projectKey);
    if (current?.refreshToken === spentRefreshToken) {
      await persist(session.apiUrl, refreshed, session.projectKey);
      return refreshed.accessToken;
    }
    return current?.accessToken ?? null;
  } catch (e) {
    console.warn('[tolgee] session refresh failed', e);
    const current = await loadByKey(session.apiUrl, session.projectKey);
    if (
      isTerminalRefreshFailure(e) &&
      current?.refreshToken === spentRefreshToken
    ) {
      await browser.storage.local.remove(sessionKey(session));
    }
    return null;
  }
};

// The OAuth token endpoint reports a dead refresh token as invalid_grant, i.e. HTTP 400 or 401.
const isTerminalRefreshFailure = (e: unknown) =>
  e instanceof OAuthTokenEndpointError &&
  (e.status === 400 || e.status === 401);

const OAUTH_KEY_PREFIX = 'oauth:';

const keyFor = (apiUrl: string, projectKey: string) =>
  `${OAUTH_KEY_PREFIX}${originOf(apiUrl)}:${projectKey}`;
