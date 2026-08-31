import browser from 'webextension-polyfill';
import { OAUTH_REFRESH_SKEW_MS } from '../constants';
import { OAuthTokenEndpointError, OAuthTokens, refresh } from './oauthClient';
import {
  ALL_PROJECTS_KEY,
  projectKeyForToken,
  scopeServesProject,
} from './tokenScope';
import { originOf, sameOrigin } from './url';

export type StoredSession = OAuthTokens & {
  apiUrl: string;
  projectKey: string;
};

export const isTokenFresh = (session: Pick<StoredSession, 'expiresAt'>) =>
  session.expiresAt - OAUTH_REFRESH_SKEW_MS > Date.now();

export const saveSession = async (
  apiUrl: string,
  tokens: OAuthTokens
): Promise<string> => {
  const projectKey = projectKeyForToken(tokens.accessToken);
  await persist(apiUrl, tokens, projectKey);
  return projectKey;
};

export const loadSession = async (
  apiUrl: string,
  projectId?: number | string
): Promise<StoredSession | null> => {
  const id = normalizeProjectId(projectId);
  if (id !== undefined) {
    const exact = await loadByKey(apiUrl, id);
    if (exact) {
      return exact;
    }
    // A composite-key ("5,7") session is matched by membership, sorted so the pick is deterministic if several match.
    const member = (await loadAllSessions())
      .filter(
        (s) =>
          s.projectKey !== ALL_PROJECTS_KEY &&
          sameOrigin(s.apiUrl, apiUrl) &&
          scopeServesProject(s.projectKey, id)
      )
      .sort((a, b) => a.projectKey.localeCompare(b.projectKey))[0];
    if (member) {
      return member;
    }
  }
  return loadByKey(apiUrl, ALL_PROJECTS_KEY);
};

export const clearSessionByKey = (apiUrl: string, projectKey: string) =>
  browser.storage.local.remove(keyFor(apiUrl, projectKey));

export const clearSession = async (
  apiUrl: string,
  projectId?: number | string
) => {
  const session = await loadSession(apiUrl, projectId);
  if (session) {
    await clearSessionByKey(apiUrl, session.projectKey);
  }
};

// Delete exactly the session a token belongs to, keyed by the token's own scope (handles all-projects and multi-set).
export const clearSessionForToken = (apiUrl: string, accessToken: string) =>
  clearSessionByKey(apiUrl, projectKeyForToken(accessToken));

// A '*'/shared session is reused across sites on the same backend, so a per-site Disconnect deletes it only when no
// origin other than the disconnecting one still marks it connected.
export const clearSessionIfUnreferenced = async (
  apiUrl: string,
  projectKey: string,
  excludeOrigin: string
) => {
  const all = await browser.storage.local.get(null);
  const referenced = Object.entries(all).some(([key, value]) => {
    if (key === excludeOrigin || key.startsWith(OAUTH_KEY_PREFIX)) {
      return false;
    }
    const marker = value as {
      oauth?: boolean;
      apiUrl?: string;
      projectKey?: string;
    };
    return Boolean(
      marker?.oauth &&
        marker.apiUrl &&
        sameOrigin(marker.apiUrl, apiUrl) &&
        marker.projectKey === projectKey
    );
  });
  if (!referenced) {
    await clearSessionByKey(apiUrl, projectKey);
  }
};

export const loadAllSessions = async (): Promise<StoredSession[]> => {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(OAUTH_KEY_PREFIX))
    .map(([, value]) => value as StoredSession);
};

export const sessionKey = (session: StoredSession) =>
  keyFor(session.apiUrl, session.projectKey);

// Resolve by the tab's recorded scope key — never re-derive from a page-supplied projectId (which could point the
// refresh at a different keyed session).
export const resolveSessionForTab = (tab: {
  apiUrl: string;
  projectKey: string;
}) => loadByKey(tab.apiUrl, tab.projectKey);

export const getValidAccessToken = async (
  apiUrl: string,
  projectId?: number | string,
  { soleOriginFallback = false }: { soleOriginFallback?: boolean } = {}
): Promise<string | null> => {
  const session =
    (await loadSession(apiUrl, projectId)) ??
    (soleOriginFallback
      ? await soleOriginFallbackSession(apiUrl, projectId)
      : null);
  if (!session) {
    return null;
  }
  return ensureFreshToken(session);
};

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

const soleOriginFallbackSession = async (
  apiUrl: string,
  projectId?: number | string
): Promise<StoredSession | null> => {
  const sole = await soleOriginSession(apiUrl);
  if (!sole) {
    return null;
  }
  const id = normalizeProjectId(projectId);
  if (id !== undefined && !scopeServesProject(sole.projectKey, id)) {
    return null;
  }
  return sole;
};

const soleOriginSession = async (
  apiUrl: string
): Promise<StoredSession | null> => {
  const originSessions = (await loadAllSessions()).filter((s) =>
    sameOrigin(s.apiUrl, apiUrl)
  );
  return originSessions.length === 1 ? originSessions[0] : null;
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
    // A Disconnect or reconnect can land during the network round-trip. Write back (and hand out) our result only if this
    // is still the session we refreshed; otherwise serve whatever replaced it, never the orphan we just declined to store.
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

// Only 400/401 (invalid_grant) means a dead refresh token; other statuses and network failures are transient.
const isTerminalRefreshFailure = (e: unknown) =>
  e instanceof OAuthTokenEndpointError &&
  (e.status === 400 || e.status === 401);

const OAUTH_KEY_PREFIX = 'oauth:';

const keyFor = (apiUrl: string, projectKey: string) =>
  `${OAUTH_KEY_PREFIX}${originOf(apiUrl)}:${projectKey}`;

const normalizeProjectId = (projectId?: number | string) =>
  projectId === undefined || projectId === null || projectId === ''
    ? undefined
    : String(projectId);
