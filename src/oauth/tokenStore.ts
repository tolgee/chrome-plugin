import browser from 'webextension-polyfill';
import { OAUTH_REFRESH_SKEW_MS } from '../constants';
import { OAuthTokens, refresh } from './oauthClient';
import { ALL_PROJECTS_KEY, projectKeyForToken } from './tokenScope';

export type StoredSession = OAuthTokens & {
  apiUrl: string;
  projectKey: string;
};

const originOf = (apiUrl: string) => new URL(apiUrl).origin;

// Sessions are keyed by (backend origin, project scope): two concrete-project logins on the same backend coexist
// instead of overwriting each other, and an all-projects ('*') session is reused for any project on that origin.
const keyFor = (apiUrl: string, projectKey: string) =>
  `oauth:${originOf(apiUrl)}:${projectKey}`;

const normalizeProjectId = (projectId?: number | string) =>
  projectId === undefined || projectId === null || projectId === ''
    ? undefined
    : String(projectId);

const persist = async (
  apiUrl: string,
  tokens: OAuthTokens,
  projectKey: string
) => {
  await browser.storage.local.set({
    [keyFor(apiUrl, projectKey)]: { ...tokens, apiUrl, projectKey },
  });
};

// Stores a freshly minted token under its own project scope, returning the key so callers can log it. A refresh keeps
// the original key (see refreshSession) so a rotated token never lands under a different scope.
export const saveSession = async (
  apiUrl: string,
  tokens: OAuthTokens
): Promise<string> => {
  const projectKey = projectKeyForToken(tokens.accessToken);
  await persist(apiUrl, tokens, projectKey);
  return projectKey;
};

const loadByKey = async (
  apiUrl: string,
  projectKey: string
): Promise<StoredSession | null> => {
  const key = keyFor(apiUrl, projectKey);
  const stored = await browser.storage.local.get(key);
  return (stored[key] as StoredSession) ?? null;
};

// The session serving a page on `projectId`: its own concrete-project session when one exists, otherwise an
// all-projects session (whose token covers every project on the backend). Strict — no guessing — so disconnect
// (clearSession) never removes a session the caller didn't ask for.
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
  }
  return loadByKey(apiUrl, ALL_PROJECTS_KEY);
};

// The sole session for an origin, or null when there are zero or several. The read path falls back to this so a caller
// that doesn't know the project yet (e.g. the popup reopening before it re-resolves the page's project) still resolves
// its one session instead of being told "not connected".
const soleOriginSession = async (
  apiUrl: string
): Promise<StoredSession | null> => {
  const originSessions = (await loadAllSessions()).filter(
    (s) => originOf(s.apiUrl) === originOf(apiUrl)
  );
  return originSessions.length === 1 ? originSessions[0] : null;
};

export const clearSession = async (
  apiUrl: string,
  projectId?: number | string
) => {
  const session = await loadSession(apiUrl, projectId);
  if (session) {
    await browser.storage.local.remove(keyFor(apiUrl, session.projectKey));
  }
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

// A refresh rotates the refresh token, so two concurrent refreshes for the same session would both spend the same
// (single-use) token: the first wins, the second gets invalid_grant and clears the just-refreshed session. The alarm
// handler and an OAUTH_GET_TOKEN message can land in the same worker at once, so share one in-flight refresh per key.
const inFlightRefresh = new Map<string, Promise<string | null>>();

const refreshSession = async (
  session: StoredSession
): Promise<string | null> => {
  try {
    const refreshed = await refresh(session.apiUrl, session.refreshToken!);
    // Persist under the session's original key: a refresh must keep the same project scope, never re-key the session.
    await persist(session.apiUrl, refreshed, session.projectKey);
    return refreshed.accessToken;
  } catch (e) {
    if (isTerminalRefreshFailure(e)) {
      await browser.storage.local.remove(
        keyFor(session.apiUrl, session.projectKey)
      );
    }
    return null;
  }
};

// Returns a valid access token for the given project, refreshing (and persisting) if it is expired or near expiry.
// Falls back to an all-projects session, then to the origin's sole session; returns null when there is nothing valid
// to serve it.
export const getValidAccessToken = async (
  apiUrl: string,
  projectId?: number | string
): Promise<string | null> => {
  const session =
    (await loadSession(apiUrl, projectId)) ?? (await soleOriginSession(apiUrl));
  if (!session) {
    return null;
  }
  if (session.expiresAt - OAUTH_REFRESH_SKEW_MS > Date.now()) {
    return session.accessToken;
  }
  if (!session.refreshToken) {
    await browser.storage.local.remove(keyFor(apiUrl, session.projectKey));
    return null;
  }
  const key = keyFor(session.apiUrl, session.projectKey);
  const existing = inFlightRefresh.get(key);
  if (existing) {
    return existing;
  }
  const pending = refreshSession(session).finally(() =>
    inFlightRefresh.delete(key)
  );
  inFlightRefresh.set(key, pending);
  return pending;
};
