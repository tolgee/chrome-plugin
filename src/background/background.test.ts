import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

const store = new Map<string, unknown>();
const sent: { tabId: number; message: any }[] = [];
let messageListener: (
  message: unknown,
  sender: unknown,
  sendResponse: (r: unknown) => void
) => boolean | void;

const {
  tabsGet,
  tabsQuery,
  openPopup,
  windowsCreate,
  windowsGet,
  windowsUpdate,
} = vi.hoisted(() => ({
  tabsGet: vi.fn(async (id: number) => ({
    id,
    url: 'https://page.example/app',
  })),
  tabsQuery: vi.fn(async () => [] as { id?: number; url?: string }[]),
  openPopup: vi.fn(async () => undefined),
  windowsCreate: vi.fn(async () => ({ id: 99 })),
  windowsGet: vi.fn(async () => ({ id: 99 })),
  windowsUpdate: vi.fn(async () => undefined),
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
      onRemoved: { addListener: () => undefined },
    },
    action: {
      setIcon: vi.fn(),
      openPopup,
    },
    windows: {
      create: windowsCreate,
      get: windowsGet,
      update: windowsUpdate,
      onRemoved: { addListener: () => undefined },
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
const browser = (await import('webextension-polyfill')).default;

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
// The action popup: an extension page with no tab of its own.
const POPUP = { url: 'chrome-extension://test-extension/index.html' };
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
    openPopup.mockReset().mockResolvedValue(undefined);
    windowsCreate.mockReset().mockResolvedValue({ id: 99 });
    windowsGet.mockReset().mockRejectedValue(new Error('no such window'));
    windowsUpdate.mockReset().mockResolvedValue(undefined);
  });

  it('OAUTH_LOGIN reports the connection without the token and keeps the channel open (returns true)', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
    });

    expect(res).toEqual({ connected: true });
    expect(JSON.stringify(res)).not.toContain('tok');
  });

  it.each([undefined, 1])(
    'OAUTH_LOGIN refuses to start a login for a page speaking protocol %s, which could not use the session',
    async (protocolVersion) => {
      const res = await respond({
        type: 'OAUTH_LOGIN',
        data: {
          protocolVersion,
          apiUrl: 'https://app.tolgee.io',
          projectId: 5,
          tabId: 1,
        },
      });

      expect(res).toMatchObject({ error: expect.stringContaining('newer') });
      expect(login).not.toHaveBeenCalled();
      expect(store.has('https://page.example')).toBe(false);
    }
  );

  it('OAUTH_LOGIN stores the session, writes the connection, and marks the connecting tab as signed in without a token', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    await respond({
      type: 'OAUTH_LOGIN',
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
            session: 'oauth',
            projectId: 5,
            projectKey: '5',
            pageOrigin: 'https://page.example',
            editing: null,
          },
        },
      },
    ]);
    expect(JSON.stringify(sent)).not.toContain('tok');
  });

  it('OAUTH_LOGIN replaces a stored api key on the origin with the OAuth connection, keeping the site key the page ships', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_own',
      siteKey: 'tgpak_site',
      branch: 'feat',
      projectId: 5,
      projectKey: '5',
    });
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    await respond({
      type: 'OAUTH_LOGIN',
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
    });

    expect(store.get('https://page.example')).toEqual({
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 5,
      projectKey: '5',
      siteKey: 'tgpak_site',
    });
    expect(JSON.stringify(store.get('https://page.example'))).not.toContain(
      'tgpak_own'
    );
  });

  it('OAUTH_LOGIN reports an error rather than hanging when login rejects', async () => {
    login.mockRejectedValue(new Error('boom'));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
    });

    expect(res).toMatchObject({ error: 'boom' });
  });

  it('OAUTH_LOGIN reports the error message without the error class prefix', async () => {
    login.mockRejectedValue(
      new Error('Tolgee authorization failed: access_denied')
    );

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
    });

    expect(res).toEqual({
      error: 'Tolgee authorization failed: access_denied',
    });
  });

  it('OAUTH_LOGIN refuses to connect without a project id, rather than creating a shared session', async () => {
    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { protocolVersion: 2, apiUrl: 'https://app.tolgee.io', tabId: 1 },
    });

    expect(res).toMatchObject({ error: expect.stringContaining('project id') });
    expect(login).not.toHaveBeenCalled();
  });

  it('OAUTH_LOGIN refuses to connect without a page to connect (no tabId), rather than reporting success for a session it immediately tears down', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
      },
    });

    expect(res).toMatchObject({
      error: expect.stringContaining('page to connect'),
    });
    expect(login).not.toHaveBeenCalled();
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
  });

  it('OAUTH_LOGIN gets a fresh login when the existing session is confirmed unreachable for this project (403), and revokes it', async () => {
    seedSession({ accessToken: 'stale-token', refreshToken: 'stale-refresh' });
    fetchMock.mockResolvedValueOnce({
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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

  describe('a fresh grant that cannot reach the declared project', () => {
    const freshGrant = () =>
      login.mockResolvedValue({
        accessToken: 'tok',
        refreshToken: 'r',
        expiresAt: future(),
      });
    const probeAnswers = (status: number, body: object = {}) =>
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        json: async () => body,
      });
    const connect = () =>
      respond({
        type: 'OAUTH_LOGIN',
        data: {
          protocolVersion: 2,
          apiUrl: 'https://app.tolgee.io',
          projectId: 5,
          tabId: 1,
        },
      });

    it('probes the declared project with the fresh grant itself', async () => {
      freshGrant();

      await connect();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://app.tolgee.io/v2/projects/5',
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer tok' },
        })
      );
    });

    it.each([403, 404])(
      'is refused on %i: revoked, nothing stored, nothing injected, and the popup gets a typed refusal',
      async (status) => {
        freshGrant();
        probeAnswers(status);

        const res = await connect();

        expect(res).toEqual({
          code: 'project_inaccessible',
          projectId: 5,
          apiUrl: 'https://app.tolgee.io',
          error: "This account can't access project #5 on app.tolgee.io",
        });
        expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'r');
        expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
        expect(store.has('https://page.example')).toBe(false);
        expect(sent).toEqual([]);
      }
    );

    it('parks the refusal for the page origin, to be shown by the popup once it opens again, and reopens the popup', async () => {
      freshGrant();
      probeAnswers(403);

      await connect();

      expect(store.get('connectRefusal:https://page.example')).toEqual({
        code: 'project_inaccessible',
        projectId: 5,
        apiUrl: 'https://app.tolgee.io',
        at: expect.any(Number),
      });
      expect(openPopup).toHaveBeenCalledTimes(1);
    });

    it('falls back to a popup window on the connecting tab where the action popup cannot be opened', async () => {
      openPopup.mockRejectedValue(new Error('no user gesture'));
      freshGrant();
      probeAnswers(403);

      await connect();

      expect(windowsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'chrome-extension://test-extension/index.html?tabId=1',
        })
      );
    });

    it('drops a parked refusal as soon as the next attempt starts, and leaves none behind a successful connect', async () => {
      store.set('connectRefusal:https://page.example', {
        code: 'project_inaccessible',
        projectId: 5,
        apiUrl: 'https://app.tolgee.io',
        at: 1,
      });
      freshGrant();

      expect(await connect()).toEqual({ connected: true });

      expect(store.has('connectRefusal:https://page.example')).toBe(false);
      expect(openPopup).not.toHaveBeenCalled();
    });

    it('parks nothing for any other failure', async () => {
      login.mockRejectedValue(new Error('boom'));

      await connect();

      expect(
        [...store.keys()].filter((key) => key.startsWith('connectRefusal:'))
      ).toEqual([]);
      expect(openPopup).not.toHaveBeenCalled();
    });

    it("is refused on the platform's 400 project_not_selected, its answer for a project id that does not exist", async () => {
      freshGrant();
      probeAnswers(400, { code: 'project_not_selected', params: null });

      const res = await connect();

      expect(res).toMatchObject({ code: 'project_inaccessible', projectId: 5 });
      expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'r');
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
      expect(sent).toEqual([]);
    });

    it('is still connected on a 400 with any other code (inconclusive)', async () => {
      freshGrant();
      probeAnswers(400, { code: 'feature_not_enabled', params: ['X'] });

      expect(await connect()).toEqual({ connected: true });
      expect(revoke).not.toHaveBeenCalled();
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    });

    it('is still connected on a 401 (the grant, not the project, is what is unusable; nothing re-logs in)', async () => {
      freshGrant();
      probeAnswers(401);

      const res = await connect();

      expect(res).toEqual({ connected: true });
      expect(login).toHaveBeenCalledTimes(1);
      expect(revoke).not.toHaveBeenCalled();
      expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
        accessToken: 'tok',
      });
      expect(sent).toHaveLength(1);
    });

    it('is still connected on a 5xx (inconclusive)', async () => {
      freshGrant();
      probeAnswers(503);

      expect(await connect()).toEqual({ connected: true });
      expect(revoke).not.toHaveBeenCalled();
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
      expect(sent).toHaveLength(1);
    });

    it('is still connected when the probe fails on the network (inconclusive)', async () => {
      freshGrant();
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      expect(await connect()).toEqual({ connected: true });
      expect(revoke).not.toHaveBeenCalled();
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    });

    it('is refused after an existing session was already rejected for this project, revoking both and storing neither', async () => {
      seedSession({
        accessToken: 'stale-token',
        refreshToken: 'stale-refresh',
      });
      freshGrant();
      probeAnswers(403);

      const res = await connect();

      expect(res).toMatchObject({ code: 'project_inaccessible', projectId: 5 });
      expect(revoke).toHaveBeenCalledWith(
        'https://app.tolgee.io',
        'stale-refresh'
      );
      expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'r');
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
      expect(sent).toEqual([]);
    });

    it('leaves a session whose refresh merely failed transiently stored and unrevoked when the replacement grant is refused', async () => {
      seedSession({
        accessToken: 'old-tok',
        refreshToken: 'old-r',
        expiresAt: Date.now() - 1,
      });
      vi.spyOn(
        await import('../oauth/oauthClient'),
        'refresh'
      ).mockRejectedValue(new TypeError('Failed to fetch'));
      freshGrant();
      probeAnswers(404);

      const res = await connect();

      expect(res).toMatchObject({ code: 'project_inaccessible', projectId: 5 });
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'r');
      expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
        accessToken: 'old-tok',
        refreshToken: 'old-r',
      });
    });
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
    });

    expect(res).toEqual({ connected: true });
    expect(login).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'still-good',
    });
  });

  it('OAUTH_LOGIN does not write the connection or mark the tab when it navigated to a different origin during sign-in, and reports an error', async () => {
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
    });

    expect(res).toMatchObject({
      error: expect.stringContaining('navigated away'),
    });
    // The grant no origin references is ended, not left live in storage after a reported failure.
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
    expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'r');
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://new-server.example',
        projectId: 7,
        tabId: 1,
      },
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
    fetchMock.mockResolvedValueOnce({
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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
    fetchMock.mockResolvedValueOnce({
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
      data: {
        protocolVersion: 2,
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        tabId: 1,
      },
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

  it('OAUTH_LOGOUT resolves the session from the origin connection, revokes the grant and clears the connection when the local session actually clears', async () => {
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

  it('OAUTH_LOGOUT clears every tab of the origin, matched by origin (scheme, host and port), after the connection is gone', async () => {
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
    const connectionAtClear: boolean[] = [];
    (browser.tabs.sendMessage as Mock).mockImplementation(
      async (tabId: number, message: unknown) => {
        connectionAtClear.push(store.has('https://site-a.example'));
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
      data: { pageOrigin: 'https://site-a.example', editing: null },
    });
    expect(connectionAtClear).toEqual([false, false]);
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

  it('OAUTH_LOGOUT from a cross-origin frame of the connected tab is refused, like the proxy messages', async () => {
    seedSession();
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });

    const res = await new Promise((resolve) =>
      messageListener(
        { type: 'OAUTH_LOGOUT', data: {} },
        { ...PAGE_TAB, url: 'https://evil.example/frame', frameId: 3 },
        resolve
      )
    );

    expect(res).toMatchObject({ error: expect.stringContaining('frame') });
    expect(store.has('https://page.example')).toBe(true);
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
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

    it('answers inactive (not a hang, a throw, or a token) when the origin has no connection', async () => {
      expect(await ask()).toEqual({ active: false });
    });

    it('answers active for a connection whose session is fresh, without pushing anything to any tab', async () => {
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

    it('answers inactive when there is no session at all', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      expect(await ask()).toEqual({ active: false });
    });

    it('answers active, not inactive, when a stale session merely fails to refresh transiently (still stored)', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      seedSession({ accessToken: 'old', expiresAt: Date.now() - 1 });
      vi.spyOn(
        await import('../oauth/oauthClient'),
        'refresh'
      ).mockRejectedValue(new TypeError('Failed to fetch'));

      expect(await ask()).toEqual({ active: true });
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    });

    it('answers inactive, with the session cleared, when the refresh token is terminally rejected (invalid_grant)', async () => {
      store.set('https://page.example', {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectKey: '5',
      });
      seedSession({ accessToken: 'old', expiresAt: Date.now() - 1 });
      const { OAuthTokenEndpointError } = await import('../oauth/oauthClient');
      vi.spyOn(
        await import('../oauth/oauthClient'),
        'refresh'
      ).mockRejectedValue(new OAuthTokenEndpointError(400, 'invalid_grant'));

      expect(await ask()).toEqual({ active: false });
      expect(store.has('oauth:https://app.tolgee.io:5')).toBe(false);
    });

    it('answers inactive when the popup asks about another server or project than the connection holds', async () => {
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

  it('routes TOLGEE_POPUP_API_REQUEST to the popup proxy (action popup and popup-as-a-tab), and refuses it from a web page', async () => {
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
      text: async () => '{"id":1}',
    } as any);

    const popupMessage = {
      type: 'TOLGEE_POPUP_API_REQUEST',
      data: {
        id: 'r2',
        path: '/v2/user',
        method: 'GET',
        headers: {},
        apiUrl: 'https://app.tolgee.io',
        projectKey: '5',
        pageOrigin: 'https://page.example',
      },
    };

    expect(await respond(popupMessage, POPUP)).toMatchObject({
      response: { status: 200, body: '{"id":1}' },
    });
    expect(await respond(popupMessage, POPUP_TAB)).toMatchObject({
      response: { status: 200, body: '{"id":1}' },
    });
    expect(await respond(popupMessage, PAGE_TAB)).toMatchObject({
      error: { kind: 'not_allowed' },
    });
  });
});

describe('OPEN_POPUP', () => {
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const send = (sender: object) =>
    messageListener({ type: 'OPEN_POPUP' }, sender, () => undefined);
  // The focus-request cooldown (popupControl.ts) is per-tab real time: each test gets its own far-apart slice so
  // a fresh trigger in one test is never throttled by a timestamp a previous test left behind for the same tab.
  let clock = Date.now();
  const pastCooldown = () => vi.setSystemTime((clock += 60_000));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime((clock += 60_000));
    openPopup.mockReset();
    openPopup.mockResolvedValue(undefined);
    windowsCreate.mockReset().mockResolvedValue({ id: 99 });
    windowsGet.mockReset().mockRejectedValue(new Error('no such window'));
    windowsUpdate.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the action popup and no window when the browser allows it (Chrome)', async () => {
    send(PAGE_TAB);
    await flush();

    expect(openPopup).toHaveBeenCalledTimes(1);
    expect(windowsCreate).not.toHaveBeenCalled();
  });

  it('opens the popup page as a window on the requesting tab when action.openPopup rejects (Firefox, outside a user-input handler)', async () => {
    openPopup.mockRejectedValue(
      new Error('openPopup requires a user input handler')
    );

    send(PAGE_TAB);
    await flush();

    expect(windowsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://test-extension/index.html?tabId=1',
      type: 'popup',
      width: 420,
      height: 640,
    });
  });

  it('opens the window the same way when action.openPopup does not exist (older Chrome)', async () => {
    const action = browser.action as { openPopup?: unknown };
    const original = action.openPopup;
    delete action.openPopup;
    try {
      send(PAGE_TAB);
      await flush();
    } finally {
      action.openPopup = original;
    }

    expect(windowsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'chrome-extension://test-extension/index.html?tabId=1',
      })
    );
  });

  it('opens no window for a sender that is not a web page tab', async () => {
    openPopup.mockRejectedValue(new Error('no'));

    send(POPUP);
    send({ url: 'https://page.example/app' });
    await flush();

    expect(windowsCreate).not.toHaveBeenCalled();
  });

  it('reuses the fallback window for a repeat request from the same tab instead of creating another one', async () => {
    const REPEAT_TAB = {
      url: 'https://page.example/app',
      tab: { id: 421, url: 'https://page.example/app', windowId: 1 },
    };
    openPopup.mockRejectedValue(new Error('no user gesture'));
    windowsGet.mockResolvedValue({ id: 99 });

    send(REPEAT_TAB);
    await flush();
    pastCooldown();
    send(REPEAT_TAB);
    await flush();

    expect(windowsCreate).toHaveBeenCalledTimes(1);
    expect(windowsGet).toHaveBeenCalledWith(99);
    expect(windowsUpdate).toHaveBeenCalledWith(99, { focused: true });
  });

  it('creates a fresh window when the previously tracked one was closed by the user', async () => {
    const REOPEN_TAB = {
      url: 'https://page.example/app',
      tab: { id: 422, url: 'https://page.example/app', windowId: 1 },
    };
    openPopup.mockRejectedValue(new Error('no user gesture'));

    send(REOPEN_TAB);
    await flush();
    pastCooldown();
    send(REOPEN_TAB);
    await flush();

    expect(windowsCreate).toHaveBeenCalledTimes(2);
  });

  it('throttles a second focus request for the same tab within the cooldown', async () => {
    const THROTTLE_TAB = {
      url: 'https://page.example/app',
      tab: { id: 423, url: 'https://page.example/app', windowId: 1 },
    };
    openPopup.mockRejectedValue(new Error('no user gesture'));

    send(THROTTLE_TAB);
    await flush();
    send(THROTTLE_TAB);
    await flush();

    expect(windowsCreate).toHaveBeenCalledTimes(1);
    expect(windowsUpdate).not.toHaveBeenCalled();
  });
});

describe('TOLGEE_TAKE_SCREENSHOT (site-key path: the page uploads itself)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const capture = browser.tabs.captureVisibleTab as Mock;

  beforeEach(() => {
    capture.mockReset();
    capture.mockResolvedValue('data:image/png;base64,aGVsbG8=');
    tabsGet.mockImplementation(async (id: number) => ({
      id,
      url: 'https://page.example/app',
      active: true,
    }));
  });

  it('answers the active tab with the captured image', async () => {
    const sendResponse = vi.fn();
    messageListener({ type: 'TOLGEE_TAKE_SCREENSHOT' }, PAGE_TAB, sendResponse);
    await flush();

    expect(capture).toHaveBeenCalledWith(1);
    expect(sendResponse).toHaveBeenCalledWith('data:image/png;base64,aGVsbG8=');
  });

  it('captures nothing for a background tab, which would get a picture of whatever tab is in front', async () => {
    tabsGet.mockImplementation(async (id: number) => ({
      id,
      url: 'https://page.example/app',
      active: false,
    }));
    const sendResponse = vi.fn();
    messageListener({ type: 'TOLGEE_TAKE_SCREENSHOT' }, PAGE_TAB, sendResponse);
    await flush();

    expect(capture).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('captures nothing for a sender that is not a tab, and a cross-origin frame', async () => {
    const sendResponse = vi.fn();
    messageListener({ type: 'TOLGEE_TAKE_SCREENSHOT' }, POPUP, sendResponse);
    messageListener(
      { type: 'TOLGEE_TAKE_SCREENSHOT' },
      { ...PAGE_TAB, url: 'https://evil.example/frame', frameId: 3 },
      sendResponse
    );
    await flush();

    expect(capture).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
