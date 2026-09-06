import { isInconclusiveProxyErrorKind } from '../oauth/sessionRules';
import { ProxyErrorKind } from '../protocol';
import { normalizeUrl } from '../oauth/url';
import { hardenedFetch } from '../oauth/hardenedFetch';
import { getActiveTabOrigin } from './activeTab';
import { sendToBackground } from './sendToBackground';
import { isOAuth, Values } from './tools';

export type ProxyTarget = {
  pageOrigin: string | undefined;
  apiUrl: string | undefined;
  projectKey: string | undefined;
};

export type ProxyFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
};

export class ProxyFetchError extends Error {
  constructor(
    readonly kind: ProxyErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'ProxyFetchError';
  }
}

// Inconclusive, not confirmed invalid: a 5xx, or a 2xx whose body wasn't JSON (a maintenance or proxy block page).
export class InconclusiveHttpStatus extends Error {
  constructor(
    readonly status: number,
    path: string
  ) {
    super(`inconclusive ${path} answer: HTTP ${status}`);
    this.name = 'InconclusiveHttpStatus';
  }
}

export const isInconclusiveSessionCheckError = (e: unknown): boolean =>
  e instanceof InconclusiveHttpStatus ||
  (e instanceof ProxyFetchError && isInconclusiveProxyErrorKind(e.kind));

export const credentialFetch = async (
  values: Values,
  path: string
): Promise<ProxyFetchResponse> =>
  isOAuth(values)
    ? proxyFetch(await proxyTargetFor(values), path)
    : directFetch(values, path);

const directFetch = async (
  values: Values,
  path: string
): Promise<ProxyFetchResponse> => {
  try {
    return await hardenedFetch(`${normalizeUrl(values.apiUrl ?? '')}${path}`, {
      headers: { 'X-API-Key': values.apiKey ?? '' },
    });
  } catch (e) {
    throw new ProxyFetchError('network', String(e));
  }
};

const proxyTargetFor = async (values: Values): Promise<ProxyTarget> => ({
  pageOrigin: await getActiveTabOrigin(),
  apiUrl: values.apiUrl,
  projectKey: values.projectKey,
});

export const proxyFetch = async (
  target: ProxyTarget,
  path: string
): Promise<ProxyFetchResponse> => {
  const result = (await sendToBackground('TOLGEE_POPUP_API_REQUEST', {
    path,
    method: 'GET',
    headers: { Accept: 'application/json' },
    body: { kind: 'none' },
    apiUrl: target.apiUrl,
    projectKey: target.projectKey,
    pageOrigin: target.pageOrigin,
  })) as
    | { response: { status: number; body: string } }
    | { error: { kind: ProxyErrorKind; message: string } }
    | undefined;
  if (!result || !('response' in result)) {
    const error: { kind: ProxyErrorKind; message: string } = result?.error ?? {
      kind: 'unavailable',
      message: 'the extension did not answer',
    };
    throw new ProxyFetchError(error.kind, error.message);
  }
  const { status, body } = result.response;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
