import { isExtensionPage, MessageSender } from './sender';
import {
  locateSession,
  performWithRefresh,
  authorizeSession,
} from './proxyCredential';
import { PROXY_BUDGET_MS } from '../protocol';
import {
  allowedHeaders,
  buildBody,
  IMAGE_UPLOAD_PATH,
  resolvePopupTarget,
  resolveTabTarget,
  TargetResolver,
} from './proxyRequest';
import {
  ApiRequestData,
  AuthorizedRequest,
  failure,
  ProxyResult,
} from './proxyTypes';
import { rememberUploadIfSuccessful } from './uploadedImages';

export type { ProxyFailure, ProxyResult } from './proxyTypes';

export const handleApiRequest = (
  data: ApiRequestData,
  sender: MessageSender
): Promise<ProxyResult> => proxyApiRequest(data, sender, resolveTabTarget);

export const handlePopupApiRequest = (
  data: ApiRequestData,
  sender: MessageSender
): Promise<ProxyResult> => {
  if (!isExtensionPage(sender.url)) {
    return Promise.resolve(
      failure('not_allowed', 'only the popup may send this request')
    );
  }
  return proxyApiRequest(data, sender, resolvePopupTarget);
};

const proxyApiRequest = async (
  data: ApiRequestData,
  sender: MessageSender,
  resolveRequestTarget: TargetResolver
): Promise<ProxyResult> => {
  const deadline = Date.now() + PROXY_BUDGET_MS;
  // Target resolution (and, for handleApiRequest, the allowlist) runs before authorizeSession, so a disallowed
  // method/path can never trigger a refresh (and rotate the refresh token) it has no business causing.
  const located = await locateSession(data, sender);
  if ('error' in located) {
    return located;
  }
  const target = await resolveRequestTarget(
    data.method,
    data.path,
    located.connection
  );
  if ('error' in target) {
    return target;
  }
  const gate = await authorizeSession(located);
  if ('error' in gate) {
    return gate;
  }
  let body: BodyInit | undefined;
  try {
    body = buildBody(data.body);
  } catch (e) {
    return failure('not_allowed', `malformed request body: ${String(e)}`);
  }
  const request: AuthorizedRequest = {
    method: target.method,
    headers: allowedHeaders(data.headers),
    body,
  };
  const result = await performWithRefresh(
    gate,
    target.pathWithQuery,
    request,
    deadline
  );
  if (target.method === 'POST' && target.apiPath === IMAGE_UPLOAD_PATH) {
    if ('response' in result) {
      await rememberUploadIfSuccessful(located.connection, result.response);
    }
  }
  return result;
};
