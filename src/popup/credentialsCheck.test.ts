import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendToBackground } = vi.hoisted(() => ({ sendToBackground: vi.fn() }));
vi.mock('./sendToBackground', () => ({ sendToBackground }));
vi.mock('./activeTab', () => ({
  getActiveTab: async () => ({ url: 'https://page.example/app' }),
  getActiveTabOrigin: async () => 'https://page.example',
}));

import { checkApiKey, checkOAuthSession } from './credentialsCheck';
import { InconclusiveHttpStatus, ProxyFetchError } from './proxyFetch';

const OAUTH = { apiUrl: 'https://app.tolgee.io', oauth: true, projectKey: '7' };
const KEY = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' };

const workerAnswers = (status: number, body: string) =>
  sendToBackground.mockResolvedValue({ response: { status, body } });

describe('checkOAuthSession', () => {
  afterEach(() => sendToBackground.mockReset());

  it('reports the signed-in user from /v2/user', async () => {
    workerAnswers(200, '{"name":"Jo"}');

    expect(await checkOAuthSession(OAUTH)).toEqual({
      oauth: true,
      userFullName: 'Jo',
    });
  });

  it('rejects with a verdict on a 401, the one status that confirms the token is unusable', async () => {
    workerAnswers(401, '{}');

    await expect(checkOAuthSession(OAUTH)).rejects.toThrow('Invalid session');
  });

  it.each([500, 502, 503])(
    'rejects as inconclusive on a %s, which says nothing about the session',
    async (status) => {
      workerAnswers(status, '');

      await expect(checkOAuthSession(OAUTH)).rejects.toBeInstanceOf(
        InconclusiveHttpStatus
      );
    }
  );

  it('rejects as inconclusive on a 2xx whose body is not JSON (a maintenance or proxy page)', async () => {
    workerAnswers(200, '<html>maintenance</html>');

    await expect(checkOAuthSession(OAUTH)).rejects.toBeInstanceOf(
      InconclusiveHttpStatus
    );
  });

  it('lets the worker verdict through as a ProxyFetchError', async () => {
    sendToBackground.mockResolvedValue({
      error: { kind: 'no_session', message: 'gone' },
    });

    await expect(checkOAuthSession(OAUTH)).rejects.toMatchObject({
      kind: 'no_session',
    });
    await expect(checkOAuthSession(OAUTH)).rejects.toBeInstanceOf(
      ProxyFetchError
    );
  });
});

describe('checkApiKey', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports the project the key opens, with branching off unless the server says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          projectName: 'Demo',
          projectId: 7,
          scopes: ['keys.view'],
          userFullName: 'Jo',
        }),
      }))
    );

    expect(await checkApiKey(KEY)).toEqual({
      projectName: 'Demo',
      projectId: 7,
      scopes: ['keys.view'],
      userFullName: 'Jo',
      branchingEnabled: false,
    });
  });

  it.each([400, 401, 403])(
    'rejects with a verdict on a %i, a confirmed answer that the key is invalid',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status }))
      );

      await expect(checkApiKey(KEY)).rejects.toThrow('Invalid API key');
    }
  );

  it.each([500, 502, 503])(
    'rejects as inconclusive on a %s, which says nothing about the key (not KeyRejected)',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status }))
      );

      await expect(checkApiKey(KEY)).rejects.toBeInstanceOf(
        InconclusiveHttpStatus
      );
    }
  );

  it('rejects as inconclusive on a 2xx whose body is not JSON (a maintenance or proxy page)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('not json');
        },
      }))
    );

    await expect(checkApiKey(KEY)).rejects.toBeInstanceOf(
      InconclusiveHttpStatus
    );
  });

  it('rejects as inconclusive (not KeyRejected) when the server redirects instead of answering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ type: 'opaqueredirect', ok: false, status: 0 }))
    );

    await expect(checkApiKey(KEY)).rejects.toBeInstanceOf(
      InconclusiveHttpStatus
    );
  });

  it('rejects as inconclusive (not KeyRejected) when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    await expect(checkApiKey(KEY)).rejects.toBeInstanceOf(ProxyFetchError);
    await expect(checkApiKey(KEY)).rejects.toMatchObject({ kind: 'network' });
  });
});
