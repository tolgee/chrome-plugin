import { OAUTH_REQUEST_TIMEOUT_MS, OPTIONAL_OAUTH_SCOPES } from '../constants';
import { PROXY_BUDGET_MS } from '../protocol';
import {
  authorizedFetch,
  authorizeSession,
  sendAuthorizedRequest,
} from './proxyCredential';
import { login, OAuthTokens, revoke } from '../oauth/oauthClient';
import {
  clearSessionByKey,
  ensureFreshToken,
  loadSession,
  loadSessionByKey,
  saveSession,
  StoredSession,
} from '../oauth/tokenStore';
import { ProjectInaccessibleError } from '../oauth/connectRefusal';
import {
  confirmsProjectInaccessible,
  confirmsTokenUnusable,
  errorCodeOf,
} from '../oauth/sessionRules';
import { isSessionReferencedByAnyOrigin } from '../oauth/connection';
import { LocatedSession } from './proxyTypes';

type OAuthLocatedSession = Extract<LocatedSession, { kind: 'oauth' }>;

// ensureFreshToken alone only proves a token is unexpired, not that it can still reach this project or that the
// grant itself hasn't been revoked entirely; either can happen server-side after connect.
export const acquireSession = async (
  apiUrl: string,
  projectId: number
): Promise<StoredSession> => {
  const existing = await loadSession(apiUrl, projectId);
  if (!existing) {
    return loginVerified(apiUrl, projectId);
  }
  const fresh = await ensureFreshToken(existing);
  if ('failure' in fresh) {
    const replacement = await loginVerified(apiUrl, projectId);
    await revokeSession(existing);
    return replacement;
  }
  const verdict = await probeProject(apiUrl, projectId, fresh.accessToken);
  if (verdict === 'not_rejected') {
    return existing;
  }
  await clearSessionByKey(apiUrl, existing.projectKey);
  await revokeSession(existing);
  return loginVerified(apiUrl, projectId);
};

export const missingPermissions = async (
  located: OAuthLocatedSession
): Promise<string[]> => {
  const missing = missingOptionalScopes(located.session);
  if (missing.length === 0) {
    return [];
  }
  const held = await userScopes(located);
  return held ? missing.filter((scope) => held.includes(scope)) : [];
};

export const reauthorize = async (stored: StoredSession): Promise<void> => {
  if (missingOptionalScopes(stored).length === 0) {
    return;
  }
  const { apiUrl } = stored;
  const projectId = Number(stored.projectKey);
  const tokens = await loginVerifiedTokens(apiUrl, projectId);
  const current = await loadSession(apiUrl, projectId);
  if (!current) {
    await revokeTokens(apiUrl, tokens);
    return;
  }
  await saveSession(apiUrl, tokens, projectId);
  await revokeSession(current);
};

const missingOptionalScopes = ({ scopes }: StoredSession): string[] =>
  scopes
    ? OPTIONAL_OAUTH_SCOPES.filter((scope) => !scopes.includes(scope))
    : [];

const userScopes = async (
  located: OAuthLocatedSession
): Promise<string[] | null> => {
  const authorized = await authorizeSession(located);
  if ('error' in authorized) {
    return null;
  }
  const result = await sendAuthorizedRequest(
    authorized,
    `/v2/api-keys/current-permissions?projectId=${located.connection.projectKey}`,
    { method: 'GET', headers: {} },
    Date.now() + PROXY_BUDGET_MS
  );
  if ('error' in result || result.response.status !== 200) {
    return null;
  }
  try {
    const scopes = JSON.parse(result.response.body)?.userScopes;
    return Array.isArray(scopes) ? scopes.map(String) : null;
  } catch {
    return null;
  }
};

const loginVerified = async (
  apiUrl: string,
  projectId: number
): Promise<StoredSession> =>
  saveSession(apiUrl, await loginVerifiedTokens(apiUrl, projectId), projectId);

// The consent screen can bind the grant to any project, and the declared project may not exist.
const loginVerifiedTokens = async (apiUrl: string, projectId: number) => {
  const tokens = await login(apiUrl, projectId);
  const verdict = await probeProject(apiUrl, projectId, tokens.accessToken);
  if (verdict === 'project_inaccessible') {
    await revokeTokens(apiUrl, tokens);
    throw new ProjectInaccessibleError(projectId, apiUrl);
  }
  return tokens;
};

type ProbeVerdict = 'not_rejected' | 'token_unusable' | 'project_inaccessible';

const probeProject = async (
  apiUrl: string,
  projectId: number,
  accessToken: string
): Promise<ProbeVerdict> => {
  try {
    const res = await authorizedFetch(
      apiUrl,
      `/v2/projects/${projectId}`,
      { bearer: accessToken },
      {
        method: 'GET',
        headers: {},
        signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
      }
    );
    const code = res.status === 400 ? await errorCodeOf(res) : undefined;
    if (confirmsProjectInaccessible(res.status, code)) {
      return 'project_inaccessible';
    }
    if (confirmsTokenUnusable(res.status)) {
      return 'token_unusable';
    }
    return 'not_rejected';
  } catch {
    return 'not_rejected';
  }
};

export const endSessionIfUnreferenced = async (
  apiUrl: string,
  projectKey: string
) => {
  const session = await loadSessionByKey(apiUrl, projectKey);
  if (!session) {
    return;
  }
  if (await isSessionReferencedByAnyOrigin(apiUrl, projectKey)) {
    return;
  }
  await clearSessionByKey(apiUrl, projectKey);
  await revokeSession(session);
};

const revokeTokens = (apiUrl: string, tokens: OAuthTokens) =>
  revoke(apiUrl, tokens.refreshToken ?? tokens.accessToken).catch((e) =>
    console.warn('[tolgee] revoke failed', e)
  );

const revokeSession = (session: StoredSession) =>
  revokeTokens(session.apiUrl, session);
