import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_ALARM_PERIOD_MINUTES } from '../constants';

const store = new Map<string, unknown>();
const sent: { tabId: number; message: any }[] = [];
let messageListener: (
  message: unknown,
  sender: unknown,
  sendResponse: (r: unknown) => void
) => boolean | void;
let alarmListener: (alarm: { name: string }) => void;

const { alarmsGet, alarmsCreate, existingAlarm } = vi.hoisted(() => {
  const state: { existing: { name: string } | undefined } = {
    existing: undefined,
  };
  return {
    alarmsGet: vi.fn(async () => state.existing),
    alarmsCreate: vi.fn(async (name: string) => {
      state.existing = { name };
    }),
    existingAlarm: state,
  };
});

const { tabsGet } = vi.hoisted(() => ({
  tabsGet: vi.fn(async (id: number) => ({
    id,
    url: 'https://page.example/app',
  })),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: (fn: typeof messageListener) => {
          messageListener = fn;
        },
      },
      onStartup: { addListener: () => {} },
    },
    tabs: {
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      get: tabsGet,
      sendMessage: vi.fn(async (tabId: number, message: unknown) => {
        sent.push({ tabId, message });
      }),
      captureVisibleTab: vi.fn(),
    },
    alarms: {
      get: alarmsGet,
      create: alarmsCreate,
      onAlarm: {
        addListener: (fn: typeof alarmListener) => {
          alarmListener = fn;
        },
      },
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
const { ensureRefreshAlarm, REFRESH_ALARM } = await import('./background');

const respond = (
  message: unknown,
  sender: { tab?: { id?: number; url?: string; windowId?: number } } = {}
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
  tab: { id: 1, url: 'https://page.example/app', windowId: 1 },
};

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
  });

  it('OAUTH_TAB_CONNECTED registers the tab only from the marker, never from the page-supplied apiUrl alone', async () => {
    await respond(
      {
        type: 'OAUTH_TAB_CONNECTED',
        data: { apiUrl: 'https://app.tolgee.io' },
      },
      PAGE_TAB
    );

    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'stale',
      refreshToken: 'r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    await alarmListener({ name: 'tolgee-oauth-refresh' });
    expect(sent).toEqual([]);
  });

  it('OAUTH_TAB_CONNECTED registers the tab once a real marker exists for that origin, and pushes the current token immediately', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'still-fresh',
      refreshToken: 'r',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });

    await respond(
      {
        type: 'OAUTH_TAB_CONNECTED',
        data: { apiUrl: 'https://app.tolgee.io' },
      },
      PAGE_TAB
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      tabId: 1,
      message: {
        type: 'UPDATE_AUTH_TOKEN',
        data: { authToken: 'still-fresh', projectKey: '5' },
      },
    });

    sent.length = 0;
    await alarmListener({ name: 'tolgee-oauth-refresh' });
    expect(sent).toEqual([]);
  });

  it('OAUTH_TAB_DISCONNECTED unregisters the tab, so the alarm stops treating it as owning the session', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'still-fresh',
      refreshToken: 'r',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    await respond(
      {
        type: 'OAUTH_TAB_CONNECTED',
        data: { apiUrl: 'https://app.tolgee.io' },
      },
      PAGE_TAB
    );
    sent.length = 0;

    await respond({ type: 'OAUTH_TAB_DISCONNECTED', data: {} }, PAGE_TAB);

    // Make the session look stale, so the alarm WOULD refresh and push if it still treated the tab as registered.
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'old',
      refreshToken: 'r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    await alarmListener({ name: 'tolgee-oauth-refresh' });
    expect(sent).toEqual([]);
  });

  it('OAUTH_TAB_CONNECTED immediately reconciles a stale session, without waiting for the alarm (browser restart / navigate-away-and-back)', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'old',
      refreshToken: 'r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    vi.spyOn(await import('../oauth/oauthClient'), 'refresh').mockResolvedValue(
      {
        accessToken: 'fresh',
        refreshToken: 'r2',
        expiresAt: future(),
      }
    );

    await respond(
      {
        type: 'OAUTH_TAB_CONNECTED',
        data: { apiUrl: 'https://app.tolgee.io' },
      },
      PAGE_TAB
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      tabId: 1,
      message: {
        type: 'UPDATE_AUTH_TOKEN',
        data: { authToken: 'fresh', projectKey: '5' },
      },
    });
  });

  it('OAUTH_LOGIN responds with the access token and keeps the channel open (returns true)', async () => {
    login.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: future(),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ accessToken: 'tok' });
  });

  it('OAUTH_LOGIN actually stores the session, writes the marker, and injects credentials into the connecting tab', async () => {
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
          data: expect.objectContaining({ authToken: 'tok', projectId: 5 }),
        },
      },
    ]);
  });

  it('OAUTH_LOGIN pushes a refresh triggered here to every OTHER tab already registered for that session', async () => {
    store.set('injectedTabs', {
      2: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://other-tab.example',
        projectKey: '5',
      },
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'old',
      refreshToken: 'r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    vi.spyOn(await import('../oauth/oauthClient'), 'refresh').mockResolvedValue(
      {
        accessToken: 'fresh',
        refreshToken: 'r2',
        expiresAt: future(),
      }
    );

    await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    const pushToTab2 = sent.find(
      (s) => s.tabId === 2 && s.message.type === 'UPDATE_AUTH_TOKEN'
    );
    expect(pushToTab2).toMatchObject({
      message: { data: { authToken: 'fresh', projectKey: '5' } },
    });
  });

  it('OAUTH_LOGIN reports an error rather than hanging when login rejects', async () => {
    login.mockRejectedValue(new Error('boom'));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toMatchObject({ error: expect.stringContaining('boom') });
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
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
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

    expect(res).toEqual({ accessToken: 'fresh-tok' });
    expect(login).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(
      'https://app.tolgee.io',
      'stale-refresh'
    );
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'fresh-tok',
    });
  });

  it('OAUTH_LOGIN keeps reusing the existing session when the reachability probe fails with a 5xx (inconclusive, not a confirmed answer)', async () => {
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'still-good',
      refreshToken: 'r',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ accessToken: 'still-good' });
    expect(login).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('OAUTH_LOGIN does not write the marker or inject credentials when the tab navigated to a different origin during sign-in, and reports an error', async () => {
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
    expect(sent.some((s) => s.message.type === 'SET_CREDENTIALS')).toBe(false);
  });

  it('OAUTH_LOGIN cleans up the previous session when this origin reconnects under a different declared project', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '7',
    });
    store.set('oauth:https://app.tolgee.io:7', {
      accessToken: 'old-tok',
      refreshToken: 'old-r',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '7',
    });
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
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
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

    expect(res).toEqual({ accessToken: 'fresh-tok' });
    expect(login).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(
      'https://app.tolgee.io',
      'stale-refresh'
    );
  });

  it('OAUTH_LOGIN keeps reusing the existing session when the reachability probe rejects with a network error (inconclusive, not a confirmed answer)', async () => {
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'still-good',
      refreshToken: 'r',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(res).toEqual({ accessToken: 'still-good' });
    expect(login).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('OAUTH_LOGIN revokes the old session only AFTER a fresh login replaces it, when the refresh itself failed transiently (ambiguous, not a confirmed rejection)', async () => {
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'old-tok',
      refreshToken: 'old-r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
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

    expect(res).toEqual({ accessToken: 'new-tok' });
    expect(store.get('oauth:https://app.tolgee.io:5')).toMatchObject({
      accessToken: 'new-tok',
    });
    expect(revoke).toHaveBeenCalledWith('https://app.tolgee.io', 'old-r');
  });

  it('OAUTH_LOGIN does NOT revoke the old session when the refresh failed transiently and the fresh login also fails, leaving the old session recoverable', async () => {
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'old-tok',
      refreshToken: 'old-r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
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

  it('OAUTH_LOGIN still returns the fresh token when revoking the superseded (confirmed-dead) session fails server-side', async () => {
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
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

    expect(res).toEqual({ accessToken: 'fresh-tok' });
    expect(login).toHaveBeenCalled();
  });

  it('OAUTH_LOGOUT still clears the local session and reports success when revoking fails server-side', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'tok',
      refreshToken: 'rtok',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
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

  it('OAUTH_GET_TOKEN answers null (not a hang or throw) when the origin has no marker', async () => {
    const res = await respond({
      type: 'OAUTH_GET_TOKEN',
      data: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://page.example',
      },
    });

    expect(res).toEqual({ accessToken: null });
  });

  it('OAUTH_GET_TOKEN resolves the session from the origin marker, not from a caller-supplied key, and pushes a refresh it triggers to every OTHER tab registered for that session', async () => {
    store.set('https://page.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('injectedTabs', {
      2: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://other-tab.example',
        projectKey: '5',
      },
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'old',
      refreshToken: 'r',
      expiresAt: Date.now() - 1,
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });
    vi.spyOn(await import('../oauth/oauthClient'), 'refresh').mockResolvedValue(
      {
        accessToken: 'fresh',
        refreshToken: 'r2',
        expiresAt: future(),
      }
    );

    const res = await respond({
      type: 'OAUTH_GET_TOKEN',
      data: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://page.example',
      },
    });

    expect(res).toEqual({ accessToken: 'fresh' });
    const pushToTab2 = sent.find(
      (s) => s.tabId === 2 && s.message.type === 'UPDATE_AUTH_TOKEN'
    );
    expect(pushToTab2).toMatchObject({
      message: { data: { authToken: 'fresh', projectKey: '5' } },
    });
  });

  it('OAUTH_LOGOUT resolves the session from the origin marker, revokes the grant and clears the marker when the local session actually clears', async () => {
    store.set('https://site-a.example', {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectKey: '5',
    });
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'tok',
      refreshToken: 'rtok',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });

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
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'tok',
      refreshToken: 'rtok',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });

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
    store.set('oauth:https://app.tolgee.io:5', {
      accessToken: 'tok',
      refreshToken: 'rtok',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '5',
    });

    await respond({
      type: 'OAUTH_LOGOUT',
      data: { apiUrl: 'https://app.tolgee.io' },
    });

    expect(revoke).not.toHaveBeenCalled();
    expect(store.has('oauth:https://app.tolgee.io:5')).toBe(true);
    expect(store.has('https://site-a.example')).toBe(true);
  });

  it("does not push a session's token to a tab registered for a different project", async () => {
    store.set('injectedTabs', {
      2: {
        apiUrl: 'https://app.tolgee.io',
        pageOrigin: 'https://unrelated.example',
        projectKey: '9',
      },
    });
    store.set('oauth:https://app.tolgee.io:9', {
      accessToken: 'project-9-token',
      refreshToken: 'r9',
      expiresAt: future(),
      apiUrl: 'https://app.tolgee.io',
      projectKey: '9',
    });
    login.mockResolvedValue({
      accessToken: 'project-5-token',
      refreshToken: 'r5',
      expiresAt: future(),
    });

    await respond({
      type: 'OAUTH_LOGIN',
      data: { apiUrl: 'https://app.tolgee.io', projectId: 5, tabId: 1 },
    });

    expect(sent.some((s) => s.tabId === 2)).toBe(false);
  });
});

describe('refresh alarm scheduling', () => {
  beforeEach(() => {
    alarmsGet.mockClear();
    alarmsCreate.mockClear();
  });

  it('creates the alarm with the documented name and period when none exists', async () => {
    existingAlarm.existing = undefined;

    await ensureRefreshAlarm();

    expect(alarmsCreate).toHaveBeenCalledWith(REFRESH_ALARM, {
      periodInMinutes: REFRESH_ALARM_PERIOD_MINUTES,
    });
  });

  it('does not re-create the alarm when one already exists (MV3 re-runs this on every worker wake)', async () => {
    existingAlarm.existing = { name: REFRESH_ALARM };

    await ensureRefreshAlarm();

    expect(alarmsCreate).not.toHaveBeenCalled();
  });
});
