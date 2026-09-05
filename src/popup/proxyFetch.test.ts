import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmsProjectInaccessible,
  confirmsTokenUnusable,
} from '../oauth/sessionRules';

const { sendToBackground } = vi.hoisted(() => ({ sendToBackground: vi.fn() }));
vi.mock('./sendToBackground', () => ({ sendToBackground }));
vi.mock('./activeTab', () => ({
  getActiveTab: async () => ({ url: 'https://page.example/app' }),
  getActiveTabOrigin: async () => 'https://page.example',
}));

import {
  credentialFetch,
  InconclusiveHttpStatus,
  isInconclusiveSessionCheckError,
  proxyFetch,
  ProxyFetchError,
} from './proxyFetch';

const TARGET = {
  pageOrigin: 'https://page.example',
  apiUrl: 'https://app.tolgee.io',
  projectKey: '7',
};

describe('proxyFetch', () => {
  beforeEach(() => sendToBackground.mockReset());

  it('asks the worker for a GET on the path, stamped with the page origin, server and session key', async () => {
    sendToBackground.mockResolvedValue({
      response: { status: 200, body: '{"name":"Jo"}' },
    });

    const r = await proxyFetch(TARGET, '/v2/user');

    expect(sendToBackground).toHaveBeenCalledWith('TOLGEE_POPUP_API_REQUEST', {
      path: '/v2/user',
      method: 'GET',
      headers: { Accept: 'application/json' },
      body: { kind: 'none' },
      apiUrl: 'https://app.tolgee.io',
      projectKey: '7',
      pageOrigin: 'https://page.example',
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ name: 'Jo' });
    expect(await r.text()).toBe('{"name":"Jo"}');
  });

  it.each([401, 403, 404, 500])(
    'passes a real HTTP %s through unchanged, so the server verdict rules apply to it',
    async (status) => {
      sendToBackground.mockResolvedValue({
        response: { status, body: '{"code":"x"}' },
      });

      const r = await proxyFetch(TARGET, '/v2/projects/9');

      expect(r.ok).toBe(false);
      expect(r.status).toBe(status);
      expect(
        confirmsProjectInaccessible(r.status) || confirmsTokenUnusable(r.status)
      ).toBe([401, 403, 404].includes(status));
    }
  );

  it.each(['no_session', 'network', 'timeout', 'not_allowed', 'unavailable'])(
    'rejects on the extension error %s, never producing a status a server verdict could be read into',
    async (kind) => {
      sendToBackground.mockResolvedValue({
        error: { kind, message: 'nope' },
      });

      const outcome = proxyFetch(TARGET, '/v2/projects/9');

      await expect(outcome).rejects.toBeInstanceOf(ProxyFetchError);
      await expect(outcome).rejects.toMatchObject({ kind, message: 'nope' });
    }
  );

  it('rejects when the worker answers nothing at all', async () => {
    sendToBackground.mockResolvedValue(undefined);
    await expect(proxyFetch(TARGET, '/v2/user')).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
});

describe('isInconclusiveSessionCheckError', () => {
  it.each(['network', 'timeout', 'unavailable'] as const)(
    'treats %s as inconclusive: the session check must not report invalid',
    (kind) => {
      expect(
        isInconclusiveSessionCheckError(new ProxyFetchError(kind, 'x'))
      ).toBe(true);
    }
  );

  it('treats a non-ok or non-JSON answer no status rule confirms as inconclusive, naming the path it came from', () => {
    const inconclusive = new InconclusiveHttpStatus(
      502,
      '/v2/api-keys/current'
    );
    expect(isInconclusiveSessionCheckError(inconclusive)).toBe(true);
    expect(inconclusive.message).toContain('/v2/api-keys/current');
  });

  it.each(['no_session', 'not_allowed', 'too_large'] as const)(
    'treats %s as definitive, not inconclusive',
    (kind) => {
      expect(
        isInconclusiveSessionCheckError(new ProxyFetchError(kind, 'x'))
      ).toBe(false);
    }
  );

  it('treats a plain Error (a 401 answer) as definitive, not inconclusive', () => {
    expect(isInconclusiveSessionCheckError(new Error('Invalid session'))).toBe(
      false
    );
  });
});

describe('credentialFetch', () => {
  beforeEach(() => {
    sendToBackground.mockReset();
    vi.unstubAllGlobals();
  });

  it('goes through the worker for a signed-in session, stamped with the active tab origin, never through the popup fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    sendToBackground.mockResolvedValue({
      response: { status: 200, body: '{}' },
    });

    const r = await credentialFetch(
      { apiUrl: 'https://app.tolgee.io', oauth: true, projectKey: '7' },
      '/v2/user'
    );

    expect(r.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendToBackground).toHaveBeenCalledWith(
      'TOLGEE_POPUP_API_REQUEST',
      expect.objectContaining({
        path: '/v2/user',
        apiUrl: 'https://app.tolgee.io',
        projectKey: '7',
        pageOrigin: 'https://page.example',
      })
    );
  });

  it('fetches with the api key header for a key session, never waking the worker', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await credentialFetch(
      { apiUrl: 'https://app.tolgee.io/', apiKey: 'tgpak_x' },
      '/v2/api-keys/current'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.tolgee.io/v2/api-keys/current',
      { headers: { 'X-API-Key': 'tgpak_x' } }
    );
    expect(sendToBackground).not.toHaveBeenCalled();
  });

  it('wraps a network failure for a key session as a recognized inconclusive kind, not a plain TypeError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const outcome = credentialFetch(
      { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
      '/v2/api-keys/current'
    );

    await expect(outcome).rejects.toBeInstanceOf(ProxyFetchError);
    await expect(outcome).rejects.toMatchObject({ kind: 'network' });
    await expect(
      outcome.catch((e) => isInconclusiveSessionCheckError(e))
    ).resolves.toBe(true);
  });
});
