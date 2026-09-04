import { sendToBackground } from './sendToBackground';

// Which page's session the worker should send with; the worker resolves it from this origin's marker.
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

// Anything but a real HTTP answer: no session, refused, unreachable, timed out. Callers treat these as inconclusive
// about the server's opinion (see sessionRules.ts), never as a 401/403/404 would be.
export class ProxyFetchError extends Error {
  constructor(
    readonly kind: string,
    message: string
  ) {
    super(message);
    this.name = 'ProxyFetchError';
  }
}

export const proxyFetch = async (
  target: ProxyTarget,
  path: string
): Promise<ProxyFetchResponse> => {
  const result = (await sendToBackground('TOLGEE_API_REQUEST', {
    path,
    method: 'GET',
    headers: { Accept: 'application/json' },
    body: { kind: 'none' },
    apiUrl: target.apiUrl,
    projectKey: target.projectKey,
    pageOrigin: target.pageOrigin,
  })) as
    | { response: { status: number; body: string } }
    | { error: { kind: string; message: string } }
    | undefined;
  if (!result || !('response' in result)) {
    const error = result?.error ?? {
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
