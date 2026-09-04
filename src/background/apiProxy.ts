import browser from 'webextension-polyfill';
import { OAUTH_REQUEST_TIMEOUT_MS } from '../constants';
import { loadOAuthMarker } from '../oauth/marker';
import {
  ensureFreshToken,
  refreshAfterRejection,
  resolveSessionForTab,
  StoredSession,
} from '../oauth/tokenStore';
import { normalizeUrl, sameOrigin } from '../oauth/url';
import { ScreenshotMaker } from './ScreenshotMaker';
import { isTabSender, MessageSender, requesterOrigin } from './sender';

export const PROXY_BUDGET_MS = 30_000;
// Chrome kills an MV3 worker's in-flight fetch at roughly 30 s; each attempt stays under that on its own.
export const PROXY_REQUEST_TIMEOUT_MS = 25_000;

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOWED_HEADERS = [
  'content-type',
  'accept',
  'x-tolgee-sdk-type',
  'x-tolgee-sdk-version',
];
const REPLY_HEADERS = ['content-type', 'x-tolgee-version'];

export type FormEntry =
  | { name: string; value: string }
  | { name: string; file: { name: string; type: string; base64: string } };

export type ProxyBody =
  | { kind: 'none' }
  | { kind: 'json'; text: string }
  | { kind: 'form'; entries: FormEntry[] };

export type ProxyErrorKind =
  | 'no_session'
  | 'not_allowed'
  | 'too_large'
  | 'network'
  | 'timeout'
  | 'unavailable';

export type ProxyResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string | null>;
  body: string;
};

export type ProxyFailure = {
  error: { kind: ProxyErrorKind; message: string };
};

export type ProxyResult = { response: ProxyResponse } | ProxyFailure;

export type ApiRequestData = {
  id?: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: ProxyBody;
  // Stamped by the relay from the page's own applied slots (a tab), or by the popup from the stored marker.
  apiUrl?: string;
  projectKey?: string;
  pageOrigin?: string;
};

export type ScreenshotUploadData = Pick<
  ApiRequestData,
  'id' | 'apiUrl' | 'projectKey'
>;

type Marker = { apiUrl: string; projectKey: string };

const failure = (kind: ProxyErrorKind, message: string): ProxyFailure => ({
  error: { kind, message },
});

export const handleApiRequest = async (
  data: ApiRequestData,
  sender: MessageSender
): Promise<ProxyResult> => {
  const deadline = Date.now() + PROXY_BUDGET_MS;
  const gate = await authorize(data, sender);
  if ('error' in gate) {
    return gate;
  }
  const target = resolveTarget(
    data.method,
    data.path,
    gate.marker,
    isTabSender(sender)
  );
  if ('error' in target) {
    return target;
  }
  const request: AuthorizedRequest = {
    method: target.method,
    headers: allowedHeaders(data.headers),
    body: buildBody(data.body),
  };
  return performWithRefresh(gate, target.pathWithQuery, request, deadline);
};

export const handleScreenshotUpload = async (
  data: ScreenshotUploadData,
  sender: MessageSender
): Promise<ProxyResult & { width?: number; height?: number }> => {
  const deadline = Date.now() + PROXY_BUDGET_MS;
  if (!isTabSender(sender) || sender.tab.windowId === undefined) {
    return failure('not_allowed', 'screenshots can only be taken from a tab');
  }
  const gate = await authorize(data, sender);
  if ('error' in gate) {
    return gate;
  }
  let image: Blob;
  let size: { width: number; height: number };
  try {
    const dataUrl = await ScreenshotMaker.capture(sender.tab.windowId);
    image = await fetch(dataUrl).then((r) => r.blob());
    const bitmap = await createImageBitmap(image);
    size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
  } catch (e) {
    return failure('unavailable', `screenshot capture failed: ${String(e)}`);
  }
  // Fire-and-forget to the requesting frame: it reverts the page to its pre-screenshot state on this. Awaiting it
  // would stall the upload behind the content script's always-open message channel.
  browser.tabs
    .sendMessage(
      sender.tab.id!,
      { type: 'TOLGEE_SCREENSHOT_CAPTURED', data: { id: data.id } },
      { frameId: sender.frameId }
    )
    .catch(() => undefined);
  const body = new FormData();
  body.append('image', image);
  const result = await performWithRefresh(
    gate,
    '/v2/image-upload',
    { method: 'POST', headers: {}, body },
    deadline
  );
  return 'response' in result ? { ...result, ...size } : result;
};

type Gate = {
  marker: Marker;
  session: StoredSession;
  accessToken: string;
};

const authorize = async (
  data: Pick<ApiRequestData, 'apiUrl' | 'projectKey' | 'pageOrigin'>,
  sender: MessageSender
): Promise<Gate | ProxyFailure> => {
  if (isTabSender(sender) && !sameOrigin(sender.url, sender.tab.url)) {
    return failure(
      'not_allowed',
      'only the page itself may send Tolgee requests, not a cross-origin frame'
    );
  }
  const origin = requesterOrigin(sender, data.pageOrigin);
  const marker = origin ? await loadOAuthMarker(origin) : null;
  if (
    !marker?.projectKey ||
    !sameOrigin(marker.apiUrl, data.apiUrl) ||
    marker.projectKey !== data.projectKey
  ) {
    return failure('no_session', 'no Tolgee session for this page');
  }
  const session = await resolveSessionForTab({
    apiUrl: marker.apiUrl,
    projectKey: marker.projectKey,
  });
  const accessToken = session ? await ensureFreshToken(session) : null;
  if (!session || !accessToken) {
    return failure('no_session', 'the Tolgee session has ended');
  }
  return {
    marker: { apiUrl: marker.apiUrl, projectKey: marker.projectKey },
    session,
    accessToken,
  };
};

// The path is resolved against the marker's apiUrl before the check: a raw string prefix test on the path alone would
// admit `/v2/projects/../user`, its `%2e%2e` encoding or a backslash variant, which fetch resolves before sending.
export const resolveTarget = (
  method: string,
  path: string,
  marker: Marker,
  fromTab: boolean
): { method: string; pathWithQuery: string } | ProxyFailure => {
  const upper = String(method).toUpperCase();
  if (!ALLOWED_METHODS.includes(upper)) {
    return failure('not_allowed', `method ${method} is not proxied`);
  }
  let base: URL;
  let url: URL;
  try {
    base = new URL(normalizeUrl(marker.apiUrl) + '/');
    url = new URL(String(path).replace(/^\/+/, ''), base);
  } catch {
    return failure('not_allowed', `cannot resolve ${path}`);
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    return failure('not_allowed', `${path} leaves the Tolgee server`);
  }
  const apiPath = url.pathname.slice(base.pathname.length - 1);
  if (fromTab && !isAllowedPath(apiPath, marker.projectKey)) {
    return failure('not_allowed', `${apiPath} is not proxied`);
  }
  return { method: upper, pathWithQuery: apiPath + url.search };
};

const isAllowedPath = (pathname: string, projectKey: string) =>
  pathname === '/v2/image-upload' ||
  pathname.startsWith('/v2/image-upload/') ||
  pathname === '/v2/api-keys/current-permissions' ||
  pathname.startsWith(`/v2/projects/${projectKey}/`);

export const allowedHeaders = (
  headers: Record<string, string> | undefined
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) =>
      ALLOWED_HEADERS.includes(name.toLowerCase())
    )
  );

const buildBody = (body: ProxyBody | undefined): BodyInit | undefined => {
  if (!body || body.kind === 'none') {
    return undefined;
  }
  if (body.kind === 'json') {
    return body.text;
  }
  const form = new FormData();
  for (const entry of body.entries) {
    if ('file' in entry) {
      form.append(
        entry.name,
        new Blob([decodeBase64(entry.file.base64)], { type: entry.file.type }),
        entry.file.name
      );
    } else {
      form.append(entry.name, entry.value);
    }
  }
  return form;
};

const decodeBase64 = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

type AuthorizedRequest = {
  method: string;
  headers: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
};

export const authorizedFetch = (
  apiUrl: string,
  pathWithQuery: string,
  accessToken: string,
  request: AuthorizedRequest
): Promise<Response> =>
  fetch(`${normalizeUrl(apiUrl)}${pathWithQuery}`, {
    method: request.method,
    headers: { ...request.headers, Authorization: `Bearer ${accessToken}` },
    body: request.body,
    signal: request.signal,
  });

const performWithRefresh = async (
  gate: Gate,
  pathWithQuery: string,
  request: AuthorizedRequest,
  deadline: number
): Promise<ProxyResult> => {
  const attempt = (accessToken: string) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return Promise.reject(new DOMException('budget spent', 'TimeoutError'));
    }
    return authorizedFetch(gate.marker.apiUrl, pathWithQuery, accessToken, {
      ...request,
      signal: AbortSignal.timeout(
        Math.min(PROXY_REQUEST_TIMEOUT_MS, remaining)
      ),
    });
  };
  try {
    let res = await attempt(gate.accessToken);
    if (
      res.status === 401 &&
      deadline - Date.now() >= OAUTH_REQUEST_TIMEOUT_MS + 3_000
    ) {
      const rotated = await refreshAfterRejection(
        gate.session,
        gate.accessToken
      );
      if (!rotated) {
        return failure('no_session', 'the Tolgee session has ended');
      }
      res = await attempt(rotated);
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

const toReply = async (res: Response): Promise<ProxyResponse> => ({
  status: res.status,
  statusText: res.statusText,
  headers: Object.fromEntries(
    REPLY_HEADERS.map((name) => [name, res.headers.get(name)])
  ),
  body: await res.text(),
});
