import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAUTH_REQUEST_TIMEOUT_MS } from '../constants';

const store = new Map<string, unknown>();
const sent: { tabId: number; message: any; options: any }[] = [];

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
    },
    tabs: {
      sendMessage: vi.fn(
        async (tabId: number, message: unknown, options: unknown) => {
          sent.push({ tabId, message, options });
        }
      ),
      captureVisibleTab: vi.fn(async () => 'data:image/png;base64,aGVsbG8='),
    },
    storage: {
      local: {
        get: async (key: string | null) => {
          if (key === null) {
            return Object.fromEntries(store);
          }
          return store.has(key) ? { [key]: store.get(key) } : {};
        },
        set: async (obj: Record<string, unknown>) => {
          Object.entries(obj).forEach(([k, v]) => store.set(k, v));
        },
        remove: async (key: string) => {
          store.delete(key);
        },
      },
    },
  },
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('../oauth/oauthClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oauth/oauthClient')>();
  return { ...actual, refresh };
});

type FetchCall = { url: string; init: RequestInit };
const calls: FetchCall[] = [];
let answer: (call: FetchCall) => Promise<Response> | Response;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  if (url.startsWith('data:')) {
    return new Response(new Blob(['hello'], { type: 'image/png' }));
  }
  const call = { url, init };
  calls.push(call);
  return answer(call);
});
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('createImageBitmap', async () => ({
  width: 640,
  height: 480,
  close: () => undefined,
}));

const { handleApiRequest, handleScreenshotUpload } = await import('./apiProxy');

const API = 'https://app.tolgee.io';
const ORIGIN = 'https://page.example';
const PAGE_TAB = {
  url: 'https://page.example/app',
  frameId: 0,
  tab: { id: 1, url: 'https://page.example/app', windowId: 4 },
};
const POPUP = { url: 'chrome-extension://test-extension/index.html' };

const future = () => Date.now() + 60 * 60 * 1000;
const bearerOf = (call: FetchCall) =>
  (call.init.headers as Record<string, string>)['Authorization'];
const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-tolgee-version': '3.9' },
  });

const seedMarker = (overrides: Partial<Record<string, unknown>> = {}) =>
  store.set(ORIGIN, {
    apiUrl: API,
    oauth: true,
    projectId: 7,
    projectKey: '7',
    ...overrides,
  });
const seedSession = (
  accessToken = 'tok',
  overrides: Partial<Record<string, unknown>> = {}
) =>
  store.set(`oauth:${API}:7`, {
    accessToken,
    refreshToken: 'r',
    expiresAt: future(),
    apiUrl: API,
    projectKey: '7',
    ...overrides,
  });

const request = (
  overrides: Partial<{
    path: string;
    method: string;
    headers: Record<string, string>;
    body: any;
    apiUrl: string;
    projectKey: string;
    pageOrigin: string;
  }> = {}
) => ({
  id: 'req-1',
  path: '/v2/projects/7/keys',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  apiUrl: API,
  projectKey: '7',
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('handleApiRequest', () => {
  beforeEach(() => {
    store.clear();
    sent.length = 0;
    calls.length = 0;
    refresh.mockReset();
    answer = () => json(200, { ok: true });
    seedMarker();
    seedSession();
  });

  it('proxies an allowed request with the Bearer token of the marker session and answers the response as text', async () => {
    answer = () => json(200, { keys: [] });

    const result = await handleApiRequest(
      request({ path: '/v2/projects/7/keys?size=10' }),
      PAGE_TAB
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API}/v2/projects/7/keys?size=10`);
    expect(bearerOf(calls[0])).toBe('Bearer tok');
    expect(result).toEqual({
      response: {
        status: 200,
        statusText: '',
        headers: {
          'content-type': 'application/json',
          'x-tolgee-version': '3.9',
        },
        body: '{"keys":[]}',
      },
    });
  });

  it('keeps a path prefix of the api url', async () => {
    seedMarker({ apiUrl: 'https://host.example/tolgee/' });
    store.set('oauth:https://host.example:7', {
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
      apiUrl: 'https://host.example/tolgee/',
      projectKey: '7',
    });

    await handleApiRequest(
      request({ apiUrl: 'https://host.example/tolgee/' }),
      PAGE_TAB
    );

    expect(calls[0].url).toBe('https://host.example/tolgee/v2/projects/7/keys');
  });

  it('resolves the origin from the sender tab, so a claimed pageOrigin cannot borrow another origin session', async () => {
    store.delete(ORIGIN);
    store.set('https://other.example', {
      apiUrl: API,
      oauth: true,
      projectKey: '7',
    });

    const result = await handleApiRequest(
      request({ pageOrigin: 'https://other.example' }),
      PAGE_TAB
    );

    expect(result).toMatchObject({ error: { kind: 'no_session' } });
    expect(calls).toHaveLength(0);
  });

  it('refuses a cross-origin frame of the connected tab before looking anything up', async () => {
    const result = await handleApiRequest(request(), {
      ...PAGE_TAB,
      url: 'https://evil.example/frame',
      frameId: 3,
    });

    expect(result).toMatchObject({ error: { kind: 'not_allowed' } });
    expect(calls).toHaveLength(0);
  });

  it('answers no_session when the origin has no marker', async () => {
    store.delete(ORIGIN);

    expect(await handleApiRequest(request(), PAGE_TAB)).toMatchObject({
      error: { kind: 'no_session' },
    });
    expect(calls).toHaveLength(0);
  });

  it('answers no_session when the page is applied to a different server than the marker', async () => {
    const result = await handleApiRequest(
      request({ apiUrl: 'https://other-server.example' }),
      PAGE_TAB
    );

    expect(result).toMatchObject({ error: { kind: 'no_session' } });
    expect(calls).toHaveLength(0);
  });

  it('answers no_session when the page is applied to a different project key than the marker', async () => {
    const result = await handleApiRequest(
      request({ projectKey: '9' }),
      PAGE_TAB
    );

    expect(result).toMatchObject({ error: { kind: 'no_session' } });
    expect(calls).toHaveLength(0);
  });

  it('answers no_session when the session is gone or cannot be refreshed', async () => {
    store.delete(`oauth:${API}:7`);
    expect(await handleApiRequest(request(), PAGE_TAB)).toMatchObject({
      error: { kind: 'no_session' },
    });

    seedSession('stale', { expiresAt: Date.now() - 1 });
    refresh.mockRejectedValue(new Error('network'));
    expect(await handleApiRequest(request(), PAGE_TAB)).toMatchObject({
      error: { kind: 'no_session' },
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    '/v2/user',
    '/v2/projects',
    '/v2/projects/7',
    '/v2/projects/77/keys',
    '/v2/projects/../user',
    '/v2/projects/%2e%2e/user',
    '/v2/projects\\..\\user',
    '/v2/projects/7/../../user',
    '//evil.example/x',
    'https://evil.example/v2/projects/7/keys',
    '/v2/image-uploads',
    '/v2/api-keys/current',
  ])('refuses %s from a tab', async (path) => {
    const result = await handleApiRequest(request({ path }), PAGE_TAB);

    expect(result).toMatchObject({ error: { kind: 'not_allowed' } });
    expect(calls).toHaveLength(0);
  });

  it.each([
    '/v2/projects/7/keys',
    '/v2/projects/7/translations?filterKeyName=x',
    'v2/projects/7/keys',
    '/v2/image-upload',
    '/v2/image-upload/12,13',
    '/v2/api-keys/current-permissions?projectId=7',
  ])('proxies %s from a tab', async (path) => {
    const result = await handleApiRequest(request({ path }), PAGE_TAB);

    expect(result).toHaveProperty('response');
    expect(calls).toHaveLength(1);
  });

  it('refuses methods the SDK never uses', async () => {
    for (const method of ['HEAD', 'OPTIONS', 'TRACE', 'CONNECT']) {
      expect(
        await handleApiRequest(request({ method }), PAGE_TAB)
      ).toMatchObject({ error: { kind: 'not_allowed' } });
    }
    expect(calls).toHaveLength(0);
  });

  it('pins the project prefix to the marker projectKey, never to the rewritable projectId hint', async () => {
    seedMarker({ projectId: 9, projectKey: '7' });

    expect(
      await handleApiRequest(request({ path: '/v2/projects/9/keys' }), PAGE_TAB)
    ).toMatchObject({ error: { kind: 'not_allowed' } });
    expect(calls).toHaveLength(0);

    expect(
      await handleApiRequest(request({ path: '/v2/projects/7/keys' }), PAGE_TAB)
    ).toHaveProperty('response');
    expect(calls).toHaveLength(1);
  });

  it('forwards only the allowed headers and never a credential the page supplies', async () => {
    await handleApiRequest(
      request({
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-tolgee-sdk-type': 'JS',
          'X-Tolgee-SDK-Version': '7.0.0',
          Authorization: 'Bearer forged',
          'X-API-Key': 'tgpak_x',
          Cookie: 'a=b',
          'X-Custom': 'x',
        },
      }),
      PAGE_TAB
    );

    expect(calls[0].init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-tolgee-sdk-type': 'JS',
      'X-Tolgee-SDK-Version': '7.0.0',
      Authorization: 'Bearer tok',
    });
  });

  it('refreshes a stale token before the request', async () => {
    seedSession('stale', { expiresAt: Date.now() - 1 });
    refresh.mockResolvedValue({
      accessToken: 'fresh',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    await handleApiRequest(request(), PAGE_TAB);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(bearerOf(calls[0])).toBe('Bearer fresh');
  });

  it('on a 401 refreshes once and retries once with the new token', async () => {
    answer = (call) =>
      bearerOf(call) === 'Bearer tok' ? json(401) : json(200);
    refresh.mockResolvedValue({
      accessToken: 'new',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    const result = await handleApiRequest(request(), PAGE_TAB);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map(bearerOf)).toEqual(['Bearer tok', 'Bearer new']);
    expect(result).toMatchObject({ response: { status: 200 } });
  });

  it('answers no_session when the refresh after a 401 fails, without a second request', async () => {
    answer = () => json(401);
    const { OAuthTokenEndpointError } = await import('../oauth/oauthClient');
    refresh.mockRejectedValue(new OAuthTokenEndpointError(400, 'invalid'));

    const result = await handleApiRequest(request(), PAGE_TAB);

    expect(result).toMatchObject({ error: { kind: 'no_session' } });
    expect(calls).toHaveLength(1);
    expect(store.has(`oauth:${API}:7`)).toBe(false);
  });

  it('surfaces a second 401 as-is', async () => {
    answer = () => json(401, { code: 'invalid_oauth_token' });
    refresh.mockResolvedValue({
      accessToken: 'new',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    const result = await handleApiRequest(request(), PAGE_TAB);

    expect(calls).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      response: { status: 401, body: '{"code":"invalid_oauth_token"}' },
    });
  });

  it('two overlapping requests that both get a 401 share one refresh', async () => {
    answer = (call) =>
      bearerOf(call) === 'Bearer tok' ? json(401) : json(200);
    const pending = deferred<unknown>();
    refresh.mockReturnValue(pending.promise);

    const a = handleApiRequest(request(), PAGE_TAB);
    const b = handleApiRequest(request(), PAGE_TAB);
    await new Promise((r) => setTimeout(r, 10));
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.resolve({
      accessToken: 'new',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    const results = await Promise.all([a, b]);

    expect(results).toEqual([
      expect.objectContaining({ response: expect.anything() }),
      expect.objectContaining({ response: expect.anything() }),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map(bearerOf).sort()).toEqual([
      'Bearer new',
      'Bearer new',
      'Bearer tok',
      'Bearer tok',
    ]);
  });

  it('a request that 401s after a sibling already rotated the session retries with the rotated token, with no second refresh', async () => {
    const late = deferred<Response>();
    let oldCalls = 0;
    answer = (call) => {
      if (bearerOf(call) !== 'Bearer tok') {
        return json(200);
      }
      return ++oldCalls === 1 ? json(401) : late.promise;
    };
    refresh.mockResolvedValue({
      accessToken: 'new',
      refreshToken: 'r2',
      expiresAt: future(),
    });

    const a = handleApiRequest(request(), PAGE_TAB);
    const b = handleApiRequest(request(), PAGE_TAB);
    await a;
    expect(refresh).toHaveBeenCalledTimes(1);
    late.resolve(json(401));

    expect(await b).toMatchObject({ response: { status: 200 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map(bearerOf)).toEqual([
      'Bearer tok',
      'Bearer tok',
      'Bearer new',
      'Bearer new',
    ]);
  });

  it('answers timeout when the request is aborted by its deadline', async () => {
    answer = () => {
      throw new DOMException('signal timed out', 'TimeoutError');
    };

    expect(await handleApiRequest(request(), PAGE_TAB)).toMatchObject({
      error: { kind: 'timeout' },
    });
  });

  it('answers network when the request fails otherwise', async () => {
    answer = () => {
      throw new TypeError('Failed to fetch');
    };

    expect(await handleApiRequest(request(), PAGE_TAB)).toMatchObject({
      error: { kind: 'network' },
    });
  });

  it('returns a 401 as-is, with no refresh, when it arrived too late for a refresh and retry to fit the budget', async () => {
    const start = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    answer = () => {
      now.mockReturnValue(start + 30_000 - OAUTH_REQUEST_TIMEOUT_MS - 2_000);
      return json(401);
    };

    const result = await handleApiRequest(request(), PAGE_TAB);

    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ response: { status: 401 } });
  });

  it('rebuilds a form body into FormData, keeping file names and MIME types', async () => {
    await handleApiRequest(
      request({
        path: '/v2/image-upload',
        method: 'POST',
        headers: {},
        body: {
          kind: 'form',
          entries: [
            {
              name: 'image',
              file: { name: 'pic.png', type: 'image/png', base64: btoa('abc') },
            },
            { name: 'info', value: '{"location":"x"}' },
          ],
        },
      }),
      PAGE_TAB
    );

    const body = calls[0].init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const image = body.get('image') as File;
    expect(image.name).toBe('pic.png');
    expect(image.type).toBe('image/png');
    expect(await image.text()).toBe('abc');
    expect(body.get('info')).toBe('{"location":"x"}');
  });

  it('sends a json body as text and none as no body', async () => {
    await handleApiRequest(
      request({
        method: 'POST',
        body: { kind: 'json', text: '{"name":"k"}' },
      }),
      PAGE_TAB
    );
    await handleApiRequest(request({ body: { kind: 'none' } }), PAGE_TAB);

    expect(calls[0].init.body).toBe('{"name":"k"}');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[1].init.body).toBeUndefined();
  });

  it('lets the popup (claimed origin) reach paths outside the prefix list, still under the header filter', async () => {
    const result = await handleApiRequest(
      request({
        path: '/v2/user',
        pageOrigin: ORIGIN,
        headers: { Accept: 'application/json', Cookie: 'x' },
      }),
      POPUP
    );

    expect(result).toHaveProperty('response');
    expect(calls[0].url).toBe(`${API}/v2/user`);
    expect(calls[0].init.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer tok',
    });
  });

  it('still refuses the popup a path that leaves the server', async () => {
    const result = await handleApiRequest(
      request({ path: 'https://evil.example/v2/user', pageOrigin: ORIGIN }),
      POPUP
    );

    expect(result).toMatchObject({ error: { kind: 'not_allowed' } });
    expect(calls).toHaveLength(0);
  });

  it('answers no_session to the popup for an origin without a marker', async () => {
    const result = await handleApiRequest(
      request({ path: '/v2/user', pageOrigin: 'https://nowhere.example' }),
      POPUP
    );

    expect(result).toMatchObject({ error: { kind: 'no_session' } });
  });
});

describe('handleScreenshotUpload', () => {
  beforeEach(() => {
    store.clear();
    sent.length = 0;
    calls.length = 0;
    refresh.mockReset();
    answer = () => json(201, { id: 5, filename: 'x.png' });
    seedMarker();
    seedSession();
  });

  const upload = (sender = PAGE_TAB) =>
    handleScreenshotUpload(
      { id: 'shot-1', apiUrl: API, projectKey: '7' },
      sender
    );

  it('captures the tab, tells the requesting frame before uploading, and answers the upload with the image size', async () => {
    const order: string[] = [];
    answer = () => {
      order.push('upload');
      return json(201, { id: 5 });
    };
    const browser = (await import('webextension-polyfill')).default;
    (browser.tabs.sendMessage as any).mockImplementationOnce(
      async (tabId: number, message: unknown, options: unknown) => {
        order.push('captured');
        sent.push({ tabId, message, options });
      }
    );

    const result = await upload();

    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith(4);
    expect(sent).toEqual([
      {
        tabId: 1,
        message: { type: 'TOLGEE_SCREENSHOT_CAPTURED', data: { id: 'shot-1' } },
        options: { frameId: 0 },
      },
    ]);
    expect(order).toEqual(['captured', 'upload']);
    expect(result).toMatchObject({
      response: { status: 201 },
      width: 640,
      height: 480,
    });
  });

  it('uploads the captured image as multipart with the session token, and the image never crosses to the page', async () => {
    await upload();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API}/v2/image-upload`);
    expect(calls[0].init.method).toBe('POST');
    expect(bearerOf(calls[0])).toBe('Bearer tok');
    const image = (calls[0].init.body as FormData).get('image') as Blob;
    expect(await image.text()).toBe('hello');
    expect(JSON.stringify(sent)).not.toContain('hello');
  });

  it('refuses a sender that is not a tab, and a cross-origin frame', async () => {
    expect(await upload(POPUP as any)).toMatchObject({
      error: { kind: 'not_allowed' },
    });
    expect(
      await upload({ ...PAGE_TAB, url: 'https://evil.example/frame' })
    ).toMatchObject({ error: { kind: 'not_allowed' } });
    expect(sent).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('answers no_session without capturing when the page has no session', async () => {
    store.delete(ORIGIN);
    const browser = (await import('webextension-polyfill')).default;
    (browser.tabs.captureVisibleTab as any).mockClear();

    expect(await upload()).toMatchObject({ error: { kind: 'no_session' } });
    expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});
