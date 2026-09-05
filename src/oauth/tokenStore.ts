import browser from 'webextension-polyfill';
import { OAUTH_REFRESH_SKEW_MS } from '../constants';
import { OAuthTokenEndpointError, OAuthTokens, refresh } from './oauthClient';
import { projectKeyFor } from './sessionRules';
import { originOf } from './url';

export type StoredSession = OAuthTokens & {
  apiUrl: string;
  projectKey: string;
};

export type FreshTokenResult =
  | { accessToken: string }
  | { failure: 'session_ended' | 'refresh_failed' };

const SESSION_ENDED: FreshTokenResult = { failure: 'session_ended' };
const REFRESH_FAILED: FreshTokenResult = { failure: 'refresh_failed' };

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
): Promise<StoredSession | null> =>
  loadSessionByKey(apiUrl, projectKeyFor(projectId));

export const loadSessionByKey = async (
  apiUrl: string,
  projectKey: string
): Promise<StoredSession | null> => {
  const key = keyFor(apiUrl, projectKey);
  const stored = await browser.storage.local.get(key);
  return (stored[key] as StoredSession) ?? null;
};

export const clearSessionByKey = (apiUrl: string, projectKey: string) =>
  browser.storage.local.remove(keyFor(apiUrl, projectKey));

export const sessionKey = (session: StoredSession) =>
  keyFor(session.apiUrl, session.projectKey);

export const ensureFreshToken = async (
  session: StoredSession
): Promise<FreshTokenResult> => {
  if (isTokenFresh(session)) {
    return { accessToken: session.accessToken };
  }
  return refreshUnless(session, isTokenFresh);
};

export const refreshAfterRejection = (
  session: StoredSession,
  rejectedAccessToken: string
): Promise<FreshTokenResult> =>
  refreshUnless(
    session,
    (current) => current.accessToken !== rejectedAccessToken
  );

// Re-read at refresh time: the caller may hold a stale snapshot, so a rotated single-use refresh token isn't double-spent.
const refreshUnless = (
  session: StoredSession,
  satisfied: (current: StoredSession) => boolean
): Promise<FreshTokenResult> =>
  dedupeRefresh(sessionKey(session), async () => {
    const current = await loadSessionByKey(session.apiUrl, session.projectKey);
    if (!current) {
      return SESSION_ENDED;
    }
    if (satisfied(current)) {
      return { accessToken: current.accessToken };
    }
    if (!current.refreshToken) {
      await browser.storage.local.remove(sessionKey(current));
      return SESSION_ENDED;
    }
    return refreshSession(current);
  });

const dedupeRefresh = (
  key: string,
  run: () => Promise<FreshTokenResult>
): Promise<FreshTokenResult> => {
  const existing = inFlightRefresh.get(key);
  if (existing) {
    return existing;
  }
  const pending = run().finally(() => inFlightRefresh.delete(key));
  inFlightRefresh.set(key, pending);
  return pending;
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

// One in-flight refresh per key: refresh tokens are single-use, so a concurrent second refresh gets invalid_grant.
const inFlightRefresh = new Map<string, Promise<FreshTokenResult>>();

const refreshSession = async (
  session: StoredSession
): Promise<FreshTokenResult> => {
  const spentRefreshToken = session.refreshToken!;
  try {
    const refreshed = await refresh(session.apiUrl, spentRefreshToken);
    // A Disconnect or reconnect can land during the network round-trip.
    const current = await loadSessionByKey(session.apiUrl, session.projectKey);
    if (current?.refreshToken === spentRefreshToken) {
      await persist(session.apiUrl, refreshed, session.projectKey);
      return { accessToken: refreshed.accessToken };
    }
    return current ? { accessToken: current.accessToken } : SESSION_ENDED;
  } catch (e) {
    console.warn('[tolgee] session refresh failed', e);
    const current = await loadSessionByKey(session.apiUrl, session.projectKey);
    if (!current) {
      return SESSION_ENDED;
    }
    if (
      isTerminalRefreshFailure(e) &&
      current.refreshToken === spentRefreshToken
    ) {
      await browser.storage.local.remove(sessionKey(session));
      return SESSION_ENDED;
    }
    return REFRESH_FAILED;
  }
};

// The OAuth token endpoint reports a dead refresh token as invalid_grant, i.e. HTTP 400 or 401.
const isTerminalRefreshFailure = (e: unknown) =>
  e instanceof OAuthTokenEndpointError &&
  (e.status === 400 || e.status === 401);

const OAUTH_KEY_PREFIX = 'oauth:';

const keyFor = (apiUrl: string, projectKey: string) =>
  `${OAUTH_KEY_PREFIX}${originOf(apiUrl)}:${projectKey}`;
