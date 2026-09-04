import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const store = new Map<string, unknown>();
const sent: { tabId: number; message: any }[] = [];
let messageListener: (
  message: unknown,
  sender: unknown,
  sendResponse: (r: unknown) => void
) => boolean | void;

const { tabsGet, tabsQuery } = vi.hoisted(() => ({
  tabsGet: vi.fn(async (id: number) => ({
    id,
    url: 'https://page.example/app',
  })),
  tabsQuery: vi.fn(async () => [] as { id?: number; url?: string }[]),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: (fn: typeof messageListener) => {
          messageListener = fn;
        },
      },
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
    },
    tabs: {
      get: tabsGet,
      query: tabsQuery,
      sendMessage: vi.fn(async (tabId: number, message: unknown) => {
        sent.push({ tabId, message });
      }),
      captureVisibleTab: vi.fn(),
    },
    action: {
      setIcon: vi.fn(),
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

const { login, revoke } = vi.hoisted(() => ({
  login: vi.fn(),
  revoke: vi.fn(async () => undefined),
}));
vi.mock('../oauth/oauthClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oauth/oauthClient')>();
  return { ...actual, login, revoke };
});

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({}),
}));
vi.stubGlobal('fetch', fetchMock);

// Import after the mocks: this triggers background.ts's module-load side effects (listener registration).
await import('./background');

const respond = (
  message: unknown,
  sender: {
    url?: string;
    tab?: { id?: number; url?: string; windowId?: number };
  } = {}
): Promise<unknown> =>
  new Promise((resolve) => {
    const kept = messageListener(message, sender, resolve);
    if (kept !== true) {
      throw new Error(
        'handler did not keep the channel open (must return true)'
      );
    }
  });

const future = () => Date.now() + 60 * 60 * 1000;
const PAGE_TAB = {
  url: 'https://page.example/app',
  tab: { id: 1, url: 'https://page.example/app', windowId: 1 },
};
// The popup opened as a tab rather than as the action popup.
const POPUP_TAB = {
  url: 'chrome-extension://test-extension/index.html',
  tab: {
    id: 7,
    url: 'chrome-extension://test-extension/index.html',
    windowId: 1,
  },
};

const seedSession = (
  overrides: Partial<Record<string, unknown>> = {},
  key = 'oauth:https://app.tolgee.io:5'
) =>
  store.set(key, {
    accessToken: 'tok',
    refreshToken: 'rtok',
    expiresAt: future(),
    apiUrl: 'https://app.tolgee.io',
    projectKey: '5',
    ...overrides,
  });

describe('background message handling', () => {
  beforeEach(() => {
    store.clear();
    sent.length = 0;
    login.mockReset();
    revoke.mockReset().mockResolvedValue(undefined);
    fetchMock
      .mockReset()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    tabsGet.mockReset().mockImplementation(async (id: number) => ({
      id,
      url: 'https://page.example/app',
    }));
    tabsQuery.mockReset().mockResolvedValue([]);
  });

  it('OAUTH_LOGIN reports the connection without the token and keeps the channel open (returns true)', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(JSON.stringify(res)).not.toContain('tok');
  });

  it('OAUTH_LOGIN stores the session, writes the marker, and marks the connecting tab as signed in without a token', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'tok',
    });
    expect(store.get('https://page.example')).toMatchObject({
      oauth: true,
      projectKey: '5',
    });
    expect(sent).toEqual([
      {
        tabId: 1,
        message: {
          type: 'SET_CREDENTIALS',
          data: {
            apiUrl: 'https://app.tolgee.io',
            oauth: true,
            projectId: 5,
            projectKey: '5',
            pageOrigin: 'https://page.example',
          },
        },
      },
    ]);
    expect(JSON.stringify(sent)).not.toContain('tok');
  });

  it('OAUTH_LOGIN reports an error rather than hanging when login rejects', async () => {
    login.mockRejectedValue(new Error('boom'));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toMatchObject({ error: 'boom' });
  });

  it('OAUTH_LOGIN reports the error message without the error class prefix', async () => {
    login.mockRejectedValue(
      new Error('Tolgee authorization failed: access_denied')
    );

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({
      error: 'Tolgee authorization failed: access_denied',
    });
  });

  it('OAUTH_LOGIN refuses to connect without a project id, rather than creating a shared session', async () => {
    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', tabId: 1 },
    });

    expect(res).toMatchObject({ error: expect.stringContaining('project id') });
    expect(login).not.toHaveBeenCalled();
  });

  it('OAUTH_LOGIN gets a fresh login when the existing session is confirmed unreachable for this project (403), and revokes it', async () => {
    seedSession({ accessToken: 'stale-token', refreshToken: 'stale-refresh' });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    login.mockResolvedValue({
      accessToken: 'fresh-tok',
      refreshToken: 'fresh-r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(login).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(
      'https://app.tolgee.io',
      'stale-refresh'
    );
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'fresh-tok',
    });
  });

  it('OAUTH_LOGIN probes the project with the session Bearer token through the shared authorized fetch', async () => {
    seedSession({ accessToken: 'still-good' });

    await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.tolgee.io/v2/projects/5',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer still-good' },
      })
    );
    expect(login).not.toHaveBeenCalled();
  });

  it('OAUTH_LOGIN keeps reusing the existing session when the reachability probe fails with a 5xx (inconclusive, not a confirmed answer)', async () => {
    seedSession({ accessToken: 'still-good' });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(login).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'still-good',
    });
  });

  it('OAUTH_LOGIN does not write the marker or mark the tab when it navigated to a different origin during sign-in, and reports an error', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });
    tabsGet
      .mockImplementationOnce(async (id: number) => ({
        id,
        url: 'https://page.example/app',
      }))
      .mockImplementationOnce(async (id: number) => ({
        id,
        url: 'https://elsewhere.example/other',
      }));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toMatchObject({
      error: expect.stringContaining('navigated away'),
    });
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'tok',
    });
    expect(store.has('https://page.example')).toBe(false);
    expect(store.has('https://elsewhere.example')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('OAUTH_LOGIN cleans up the previous session when this origin reconnects under a different declared project', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '7',
    });
    seedSession(
      { accessToken: 'old-tok', refreshToken: 'old-r', projectKey: '7' },
      'oauth:https://app.tolgee.io:7'
    );
    login.mockResolvedValue({
      accessToken: 'new-tok',
      refreshToken: 'new-r',
      expiresAt: future(),
    });

    await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(store.get('https://page.example')).toMatchObject({
      projectKey: '5',
    });
    expect(store.has('oauth:https://app.tolgee.io:7')).toBe(false);
    expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'old-r');
  });

  it('OAUTH_LOGIN cleans up the previous session on the OLD server when this origin reconnects against a different server under the same project key', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://old-server.example',
      oauth: true,
      projectKey: '7',
    });
    store.set('oauth:https://old-server.example:7', {
      accessToken: 'old-tok',
      refreshToken: 'old-r',
      expiresAt: future(),
      apiUrl: 'https://old-server.example',
      projectKey: '7',
    });
    login.mockResolvedValue({
      accessToken: 'new-tok',
      refreshToken: 'new-r',
      expiresAt: future(),
    });

    await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://new-server.example', projectId: 7, tabId: 1 },
    });

    expect(store.get('https://page.example')).toMatchObject({
      apiUrl: 'https://new-server.example',
      projectKey: '7',
    });
    expect(store.has('oauth:https://old-server.example:7')).toBe(false);
    expect(revoke).toHaveBeenCalledWith('https://old-server.example', 'old-r');
  });

  it("OAUTH_LOGIN gets a fresh login when the existing session's grant itself is dead (401), and revokes it", async () => {
    seedSession({ accessToken: 'stale-token', refreshToken: 'stale-refresh' });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    login.mockResolvedValue({
      accessToken: 'fresh-tok',
      refreshToken: 'fresh-r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(login).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(
      'https://app.tolgee.io',
      'stale-refresh'
    );
  });

  it('OAUTH_LOGIN keeps reusing the existing session when the reachability probe rejects with a network error (inconclusive, not a confirmed answer)', async () => {
    seedSession({ accessToken: 'still-good' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(login).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('OAUTH_LOGIN revokes the old session only AFTER a fresh login replaces it, when the refresh itself failed transiently (ambiguous, not a confirmed rejection)', async () => {
    seedSession({
      accessToken: 'old-tok',
      refreshToken: 'old-r',
      expiresAt: Date.now() - 1,
    });
    vi.spyOn(await import('../oauth/oauthClient'), 'refresh').mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    login.mockResolvedValue({
      accessToken: 'new-tok',
      refreshToken: 'new-r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'new-tok',
    });
    expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'old-r');
  });

  it('OAUTH_LOGIN does NOT revoke the old session when the refresh failed transiently and the fresh login also fails, leaving the old session recoverable', async () => {
    seedSession({
      accessToken: 'old-tok',
      refreshToken: 'old-r',
      expiresAt: Date.now() - 1,
    });
    vi.spyOn(await import('../oauth/oauthClient'), 'refresh').mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    login.mockRejectedValue(new Error('user cancelled'));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toMatchObject({ error: expect.stringContaining('cancelled') });
    expect(revoke).not.toHaveBeenCalled();
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'old-tok',
      refreshToken: 'old-r',
    });
  });

  it('OAUTH_LOGIN still reports the connection when revoking the superseded (confirmed-dead) session fails server-side', async () => {
    seedSession({ accessToken: 'stale-token', refreshToken: 'stale-refresh' });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    revoke.mockRejectedValue(new Error('revoke endpoint down'));
    login.mockResolvedValue({
      accessToken: 'fresh-tok',
      refreshToken: 'fresh-r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ connected: true });
    expect(login).toHaveBeenCalled();
  });

  it('OAUTH_LOGOUT still clears the local session and reports success when revoking fails server-side', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();
    revoke.mockRejectedValue(new Error('revoke endpoint down'));

    const res = await respond({
      type: 'OAUTH_LOGOUT',
      data: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://site-a.example',
      },
    });

    expect(res).not.toHaveProperty('error');
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
    expect(store.has('https://site-a.example')).toBe(false);
  });

  it('OAUTH_LOGOUT resolves the session from the origin marker, revokes the grant and clears the marker when the local session actually clears', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();

    await respond({
      type: 'OAUTH_LOGOUT',
      data: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://site-a.example',
      },
    });

    expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'rtok');
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
    expect(store.has('https://site-a.example')).toBe(false);
  });

  it('OAUTH_LOGOUT clears every tab of the origin, matched by origin (scheme, host and port), after the marker is gone', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();
    tabsQuery.mockResolvedValue([
      { id: 7, url: 'https://site-a.example/page' },
      { id: 8, url: 'https://site-a.example/other?x=1' },
      { id: 9, url: 'https://site-a.example:8443/page' },
      { id: 10, url: 'http://site-a.example/page' },
      { id: 11, url: 'https://site-b.example/page' },
      { id: 12, url: 'chrome-extension://test-extension/index.html' },
      { id: 13 },
    ]);
    const browser = (await import('webextension-polyfill')).default;
    const markerAtClear: boolean[] = [];
    (browser.tabs.sendMessage as Mock).mockImplementation(
      async (tabId: number, message: unknown) => {
        markerAtClear.push(store.has('https://site-a.example'));
        sent.push({ tabId, message });
      }
    );

    await respond({
      type: 'OAUTH_LOGOUT',
      data: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://site-a.example',
      },
    });

    expect(sent.map((s) => s.tabId).sort()).toEqual([7, 8]);
    expect(sent[0].message).toEqual({
      type: 'SET_CREDENTIALS',
      data: { pageOrigin: 'https://site-a.example' },
    });
    expect(markerAtClear).toEqual([false, false]);
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
  });

  it('OAUTH_LOGOUT clears the tabs of a dev origin with a port', async () => {
    store.set('http://localhost:5173', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();
    tabsQuery.mockResolvedValue([
      { id: 1, url: 'http://localhost:5173/' },
      { id: 2, url: 'http://localhost:5174/' },
      { id: 3, url: 'http://localhost/' },
    ]);

    await respond({
      type: 'OAUTH_LOGOUT',
      data: { pageOrigin: 'http://localhost:5173' },
    });

    expect(sent.map((s) => s.tabId)).toEqual([1]);
  });

  it('OAUTH_LOGOUT does not revoke when disconnecting site is not the only reference to a shared session', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('https://site-b.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();

    await respond({
      type: 'OAUTH_LOGOUT',
      data: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://site-a.example',
      },
    });

    expect(store.has('https://site-a.example')).toBe(false);
    expect(store.has('https://site-b.example')).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
  });

  it('OAUTH_LOGOUT without a pageOrigin cannot identify a session, so it is a no-op rather than a guess', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();

    await respond({
      type: 'OAUTH_LOGOUT',
      data: { apiUrl: 'https://app.tolgee.io' },
    });

    expect(revoke).not.toHaveBeenCalled();
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    expect(store.has('https://site-a.example')).toBe(true);
  });

  it("OAUTH_LOGOUT from a tab acts on the sender tab origin, so a claimed pageOrigin cannot end another origin's session", async () => {
    store.set('https://other.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();

    await respond(
      {
        type: 'OAUTH_LOGOUT',
        data: {
          apiUrl: 'https://app.tolgee.io',
          pageOrigin: 'https://other.example',
        },
      },
      PAGE_TAB
    );

    expect(revoke).not.toHaveBeenCalled();
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    expect(store.has('https://other.example')).toBe(true);
  });

  it('OAUTH_LOGOUT from the popup opened in a tab still acts on the claimed page origin', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();

    await respond(
      {
        type: 'OAUTH_LOGOUT',
        data: {
          apiUrl: 'https://app.tolgee.io',
          pageOrigin: 'https://site-a.example',
        },
      },
      POPUP_TAB
    );

    expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'rtok');
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
    expect(store.has('https://site-a.example')).toBe(false);
  });

  describe('OAUTH_SESSION_STATE', () => {
    const ask = (
      data: Record<string, unknown> = {
        apiUrl: 'https://app.tolgee.io',
        projectKey: '5',
        pageOrigin: 'https://page.example',
      },
      sender = {}
    ) => respond({ type: 'OAUTH_SESSION_STATE', data }, sender);

    it('answers inactive (not a hang, a throw, or a token) when the origin has no marker', async () => {
      expect(await ask()).toEqual({ active: false });
    });

    it('answers active for a marker whose session is fresh, without pushing anything to any tab', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      seedSession();

      const res = await ask();

      expect(res).toEqual({ active: true });
      expect(JSON.stringify(res)).not.toContain('tok');
      expect(sent).toEqual([]);
    });

    it('refreshes a stale session on the way and answers active', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      seedSession({ accessToken: 'old', expiresAt: Date.now() - 1 });
      vi.spyOn(
        await import('../oauth/oauthClient'),
        'refresh'
      ).mockResolvedValue({
        accessToken: 'fresh',
        refreshToken: 'r2',
        expiresAt: future(),
      });

      expect(await ask()).toEqual({ active: true });
      expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
        accessToken: 'fresh',
      });
      expect(sent).toEqual([]);
    });

    it('answers inactive when the session is gone or cannot be refreshed', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      expect(await ask()).toEqual({ active: false });

      seedSession({ accessToken: 'old', expiresAt: Date.now() - 1 });
      vi.spyOn(
        await import('../oauth/oauthClient'),
        'refresh'
      ).mockRejectedValue(new TypeError('Failed to fetch'));
      expect(await ask()).toEqual({ active: false });
    });

    it('answers inactive when the popup asks about another server or project than the marker holds', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      seedSession();

      expect(
        await ask({
          apiUrl: 'https://other.tolgee.io',
          projectKey: '5',
          pageOrigin: 'https://page.example',
        })
      ).toEqual({ active: false });
      expect(
        await ask({
          apiUrl: 'https://app.tolgee.io',
          projectKey: '9',
          pageOrigin: 'https://page.example',
        })
      ).toEqual({ active: false });
    });

    it("from a tab resolves the origin from the sender tab, so a claimed pageOrigin cannot probe another origin's session", async () => {
      store.set('https://other.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      seedSession();

      expect(
        await ask(
          {
            apiUrl: 'https://app.tolgee.io',
            projectKey: '5',
            pageOrigin: 'https://other.example',
          },
          PAGE_TAB
        )
      ).toEqual({ active: false });
    });
  });

  it('routes TOLGEE_API_REQUEST to the proxy and keeps the channel open', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    seedSession();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"name":"Jo"}',
    } as any);

    const res = await respond(
      {
        type: 'TOLGEE_API_REQUEST',
        data: {
          id: 'r1',
          path: '/v2/projects/5/keys',
          method: 'GET',
          headers: {},
          apiUrl: 'https://app.tolgee.io',
          projectKey: '5',
        },
      },
      PAGE_TAB
    );

    expect(res).toMatchObject({
      response: { status: 200, body: '{"name":"Jo"}' },
    });
  });
});
