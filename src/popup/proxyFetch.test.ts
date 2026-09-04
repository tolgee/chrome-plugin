import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmsProjectInaccessible,
  confirmsTokenUnusable,
} from '../oauth/sessionRules';

const { sendToBackground } = vi.hoisted(() => ({ sendToBackground: vi.fn() }));
vi.mock('./sendToBackground', () => ({ sendToBackground }));

import { proxyFetch, ProxyFetchError } from './proxyFetch';

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

    expect(sendToBackground).toHaveBeenCalledWith('TOLGEE_API_REQUEST', {
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
