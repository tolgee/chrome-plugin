import { OAUTH_REQUEST_TIMEOUT_MS } from '../constants';
import { authorizedFetch } from './proxyCredential';
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

// The consent screen can bind the grant to any project, and the declared project may not exist: a grant that cannot
// reach the declared project is refused before it is ever saved.
const loginVerified = async (
  apiUrl: string,
  projectId: number
): Promise<StoredSession> => {
  const tokens = await login(apiUrl, projectId);
  const verdict = await probeProject(apiUrl, projectId, tokens.accessToken);
  if (verdict === 'project_inaccessible') {
    await revokeTokens(apiUrl, tokens);
    throw new ProjectInaccessibleError(projectId, apiUrl);
  }
  return saveSession(apiUrl, tokens, projectId);
};

type ProbeVerdict = 'not_rejected' | 'token_unusable' | 'project_inaccessible';

// 'not_rejected' covers a reachable project as well as an inconclusive answer (5xx, network failure, timeout).
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

// A session can be shared by more than one origin on the same backend, so it is only cleared, and only then
// revoked server-side, once no origin's connection still references it.
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
