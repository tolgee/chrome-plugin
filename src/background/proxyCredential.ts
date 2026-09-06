import { OAUTH_REQUEST_TIMEOUT_MS } from '../constants';
import { loadOriginConnection } from '../oauth/connection';
import {
  ensureFreshToken,
  FreshTokenResult,
  loadSessionByKey,
  refreshAfterRejection,
} from '../oauth/tokenStore';
import { normalizeUrl, sameOrigin } from '../oauth/url';
import { hardenedFetch, isBlockedRedirect } from '../oauth/hardenedFetch';
import { isCrossOriginFrame, MessageSender, requesterOrigin } from './sender';
import {
  ApiRequestData,
  AuthorizedRequest,
  Credential,
  failure,
  AuthorizedSession,
  LocatedSession,
  ProxyFailure,
  ProxyResponse,
  ProxyResult,
} from './proxyTypes';

// Chrome kills an MV3 worker's in-flight fetch at roughly 30 s.
export const PROXY_REQUEST_TIMEOUT_MS = 25_000;
const REFRESH_RETRY_MARGIN_MS = 3_000;
const REPLY_HEADERS = ['content-type', 'x-tolgee-version'];

export const locateSession = async (
  data: Pick<ApiRequestData, 'apiUrl' | 'projectKey' | 'pageOrigin'>,
  sender: MessageSender
): Promise<LocatedSession | ProxyFailure> => {
  if (isCrossOriginFrame(sender)) {
    return failure(
      'not_allowed',
      'only the page itself may send Tolgee requests, not a cross-origin frame'
    );
  }
  const origin = requesterOrigin(sender, data.pageOrigin);
  const located = await loadConnectedSession(origin, data.apiUrl);
  if (!located || located.connection.projectKey !== data.projectKey) {
    return failure('no_session', 'no Tolgee session for this page');
  }
  return located;
};

const loadConnectedSession = async (
  origin: string | undefined,
  apiUrl: string | undefined
): Promise<LocatedSession | null> => {
  const connection = origin ? await loadOriginConnection(origin) : null;
  if (!connection || !sameOrigin(connection.apiUrl, apiUrl)) {
    return null;
  }
  const pinned = {
    apiUrl: connection.apiUrl,
    projectKey: connection.projectKey,
  };
  if (connection.kind === 'apiKey') {
    return { connection: pinned, kind: 'apiKey', apiKey: connection.apiKey };
  }
  const session = await loadSessionByKey(
    connection.apiUrl,
    connection.projectKey
  );
  if (!session) {
    return null;
  }
  return { connection: pinned, kind: 'oauth', session };
};

export const authorizeSession = async (
  located: LocatedSession
): Promise<AuthorizedSession | ProxyFailure> => {
  if (located.kind === 'apiKey') {
    return { ...located, credential: { apiKey: located.apiKey } };
  }
  const fresh = await ensureFreshToken(located.session);
  return 'failure' in fresh
    ? refreshLostFailure(fresh)
    : { ...located, credential: { bearer: fresh.accessToken } };
};

const refreshLostFailure = (
  lost: Extract<FreshTokenResult, { failure: unknown }>
): ProxyFailure =>
  lost.failure === 'session_ended'
    ? failure('no_session', 'the Tolgee session has ended')
    : failure('unavailable', 'the session could not be refreshed, try again');

export const sendAuthorizedRequest = async (
  authorized: AuthorizedSession,
  pathWithQuery: string,
  request: AuthorizedRequest,
  deadline: number
): Promise<ProxyResult> => {
  const attempt = (credential: Credential) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return Promise.reject(new DOMException('budget spent', 'TimeoutError'));
    }
    return authorizedFetch(
      authorized.connection.apiUrl,
      pathWithQuery,
      credential,
      {
        ...request,
        signal: AbortSignal.timeout(
          Math.min(PROXY_REQUEST_TIMEOUT_MS, remaining)
        ),
      }
    );
  };
  try {
    let res = await attempt(authorized.credential);
    if (
      res.status === 401 &&
      authorized.kind === 'oauth' &&
      'bearer' in authorized.credential &&
      deadline - Date.now() >=
        OAUTH_REQUEST_TIMEOUT_MS + REFRESH_RETRY_MARGIN_MS
    ) {
      const rotated = await refreshAfterRejection(
        authorized.session,
        authorized.credential.bearer
      );
      if ('failure' in rotated) {
        return refreshLostFailure(rotated);
      }
      res = await attempt({ bearer: rotated.accessToken });
    }
    if (isBlockedRedirect(res)) {
      // 'unavailable' keeps this in oauth/sessionRules.ts's inconclusive bucket.
      return failure(
        'unavailable',
        `${authorized.connection.apiUrl} redirected this request instead of answering it`
      );
    }
    return { response: await toReply(res) };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return failure(
      name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
      String(e)
    );
  }
};

export const authorizedFetch = (
  apiUrl: string,
  pathWithQuery: string,
  credential: Credential,
  request: AuthorizedRequest
): Promise<Response> =>
  hardenedFetch(`${normalizeUrl(apiUrl)}${pathWithQuery}`, {
    method: request.method,
    headers: { ...request.headers, ...credentialHeader(credential) },
    body: request.body,
    signal: request.signal,
  });

const credentialHeader = (credential: Credential): Record<string, string> =>
  'bearer' in credential
    ? { Authorization: `Bearer ${credential.bearer}` }
    : { 'X-API-Key': credential.apiKey };

const toReply = async (res: Response): Promise<ProxyResponse> => ({
  status: res.status,
  statusText: res.statusText,
  headers: Object.fromEntries(
    REPLY_HEADERS.map((name) => [name, res.headers.get(name)])
  ),
  body: await res.text(),
});
