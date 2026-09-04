import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createApiProxyRelay,
  MAX_PROXY_PAYLOAD_BYTES,
  RelayDeps,
} from './apiProxyRelay';
import {
  API_URL_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../constants';

const SELF = {};
const ORIGIN = 'https://page.example';

const setup = (
  sessionItems: Record<string, string> = {
    [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
    [PROJECT_KEY_SESSION_STORAGE]: '7',
  }
) => {
  const posted: { type: string; data: any }[] = [];
  const deps: RelayDeps = {
    origin: ORIGIN,
    getItem: (key) => sessionItems[key] ?? null,
    sendToWorker: vi.fn(async () => ({ response: { status: 200 } })),
    postToPage: (message) => posted.push(message as any),
  };
  const relay = createApiProxyRelay(deps, SELF);
  const fromPage = (type: string, data: unknown) =>
    relay.onPageMessage({ source: SELF, origin: ORIGIN, data: { type, data } });
  return { relay, deps, posted, fromPage };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('api proxy relay', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('forwards TOLGEE_API_REQUEST to the worker stamped with the page apiUrl and projectKey, and replies under the same id', async () => {
    const { deps, posted, fromPage } = setup();
    fromPage('TOLGEE_API_REQUEST', {
      id: 'r1',
      path: '/v2/projects/7/keys',
      method: 'GET',
      headers: {},
      body: { kind: 'none' },
    });
    await flush();

    expect(deps.sendToWorker).toHaveBeenCalledWith({
      type: 'TOLGEE_API_REQUEST',
      data: {
        id: 'r1',
        path: '/v2/projects/7/keys',
        method: 'GET',
        headers: {},
        body: { kind: 'none' },
        apiUrl: 'https://app.tolgee.io',
        projectKey: '7',
      },
    });
    expect(posted).toEqual([
      {
        type: 'TOLGEE_API_RESPONSE',
        data: { id: 'r1', response: { status: 200 } },
      },
    ]);
  });

  it('relays TOLGEE_SCREENSHOT_UPLOAD the same way under TOLGEE_SCREENSHOT_UPLOADED', async () => {
    const { deps, posted, fromPage } = setup();
    (deps.sendToWorker as any).mockResolvedValue({
      response: { status: 201 },
      width: 10,
      height: 5,
    });
    fromPage('TOLGEE_SCREENSHOT_UPLOAD', { id: 's1' });
    await flush();

    expect(deps.sendToWorker).toHaveBeenCalledWith({
      type: 'TOLGEE_SCREENSHOT_UPLOAD',
      data: { id: 's1', apiUrl: 'https://app.tolgee.io', projectKey: '7' },
    });
    expect(posted).toEqual([
      {
        type: 'TOLGEE_SCREENSHOT_UPLOADED',
        data: { id: 's1', response: { status: 201 }, width: 10, height: 5 },
      },
    ]);
  });

  it('keeps concurrent replies apart by id', async () => {
    const { deps, posted, fromPage } = setup();
    const replies: Record<string, (v: unknown) => void> = {};
    (deps.sendToWorker as any).mockImplementation(
      ({ data }: { data: { id: string } }) =>
        new Promise((resolve) => (replies[data.id] = resolve))
    );
    fromPage('TOLGEE_API_REQUEST', { id: 'a', path: '/a', method: 'GET' });
    fromPage('TOLGEE_API_REQUEST', { id: 'b', path: '/b', method: 'GET' });
    replies.b({ response: { status: 200, body: 'B' } });
    await flush();
    replies.a({ response: { status: 200, body: 'A' } });
    await flush();

    expect(posted.map((p) => [p.data.id, p.data.response.body])).toEqual([
      ['b', 'B'],
      ['a', 'A'],
    ]);
  });

  it('rejects an oversized payload with too_large without waking the worker', async () => {
    const { deps, posted, fromPage } = setup();
    fromPage('TOLGEE_API_REQUEST', {
      id: 'big',
      path: '/v2/image-upload',
      method: 'POST',
      body: {
        kind: 'form',
        entries: [
          {
            name: 'image',
            file: {
              name: 'x.png',
              type: 'image/png',
              base64: 'A'.repeat(MAX_PROXY_PAYLOAD_BYTES),
            },
          },
        ],
      },
    });
    await flush();

    expect(deps.sendToWorker).not.toHaveBeenCalled();
    expect(posted).toEqual([
      {
        type: 'TOLGEE_API_RESPONSE',
        data: {
          id: 'big',
          error: expect.objectContaining({ kind: 'too_large' }),
        },
      },
    ]);
  });

  it('answers unavailable right away when the worker cannot be reached', async () => {
    const { deps, posted, fromPage } = setup();
    (deps.sendToWorker as any).mockRejectedValue(
      new Error('Extension context invalidated')
    );
    fromPage('TOLGEE_API_REQUEST', { id: 'r1', path: '/x', method: 'GET' });
    await flush();

    expect(posted).toEqual([
      {
        type: 'TOLGEE_API_RESPONSE',
        data: {
          id: 'r1',
          error: {
            kind: 'unavailable',
            message: expect.stringContaining('invalidated'),
          },
        },
      },
    ]);
  });

  it('answers unavailable when the worker returns nothing', async () => {
    const { deps, posted, fromPage } = setup();
    (deps.sendToWorker as any).mockResolvedValue(undefined);
    fromPage('TOLGEE_API_REQUEST', { id: 'r1', path: '/x', method: 'GET' });
    await flush();

    expect(posted[0].data).toMatchObject({
      id: 'r1',
      error: { kind: 'unavailable' },
    });
  });

  it('stamps nothing when the page holds no applied slots (the worker then answers no_session)', async () => {
    const { deps, fromPage } = setup({});
    fromPage('TOLGEE_API_REQUEST', { id: 'r1', path: '/x', method: 'GET' });
    await flush();

    expect((deps.sendToWorker as any).mock.calls[0][0].data).toEqual({
      id: 'r1',
      path: '/x',
      method: 'GET',
      apiUrl: undefined,
      projectKey: undefined,
    });
  });

  it('ignores messages from another window, another origin, other types, or without a string id', async () => {
    const { relay, deps, fromPage } = setup();
    relay.onPageMessage({
      source: {},
      origin: ORIGIN,
      data: { type: 'TOLGEE_API_REQUEST', data: { id: 'r1' } },
    });
    relay.onPageMessage({
      source: SELF,
      origin: 'https://evil.example',
      data: { type: 'TOLGEE_API_REQUEST', data: { id: 'r1' } },
    });
    fromPage('TOLGEE_PING', undefined);
    fromPage('TOLGEE_API_REQUEST', { path: '/x' });
    fromPage('TOLGEE_API_REQUEST', { id: 5, path: '/x' });
    await flush();

    expect(deps.sendToWorker).not.toHaveBeenCalled();
  });

  it('forwards the worker TOLGEE_SCREENSHOT_CAPTURED notice to the page and nothing else', () => {
    const { relay, posted } = setup();
    relay.onWorkerMessage({
      type: 'TOLGEE_SCREENSHOT_CAPTURED',
      data: { id: 's1' },
    });
    relay.onWorkerMessage({ type: 'SET_CREDENTIALS', data: {} });
    relay.onWorkerMessage(undefined);

    expect(posted).toEqual([
      { type: 'TOLGEE_SCREENSHOT_CAPTURED', data: { id: 's1' } },
    ]);
  });
});
