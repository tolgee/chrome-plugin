import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  BRANCH_SESSION_STORAGE,
  EDITING_SESSION_STORAGE,
  EXTENSION_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../sessionStorageKeys';
import { PROTOCOL_VERSION } from '../protocol';
import { LibConfig } from '../types';
import { siteKeyFromCode } from '../popup/apiKeyScreen';
import { credentialDelivery, sdkTooOldFor } from '../popup/delivery';
import { initialState } from '../popup/popupState';
import { changeLibConfig } from '../popup/reducerTransitions';
import {
  declaredProjectId,
  pageCredentials,
  sdkSupportsProxy,
} from '../popup/tools';
import { SessionStore, writeCredentialsIfChanged } from './credentialSink';

/*
 * The page-facing API the extension spoke before the proxied-request protocol, pinned so that sites on a published
 * @tolgee/web release keep working. The payloads below are what those releases' BrowserExtensionPlugin posts,
 * taken from the shipped bundles (dist/tolgee-web.production.umd.min.js of 5.33.2, 6.6.0 and 7.1.3, the latest of
 * each major) and confirmed against the running bundles:
 *
 * - TOLGEE_READY: `{ uiPresent: true, uiVersion: undefined, mode, config: { apiUrl, apiKey } }`, with
 *   `config.branch` added in 6.0; never `protocolVersion`, never `config.projectId`. `mode` is 'development' iff
 *   the page's own config carries an api key. Posted up to 4 times 300 ms apart until TOLGEE_PLUGIN_READY or
 *   TOLGEE_PLUGIN_UPDATED arrives; posted again on every SDK restart.
 * - Slots read: `__tolgee_apiKey` and `__tolgee_apiUrl` (all), `__tolgee_branch` (6.0+); both key and url must be
 *   set for the SDK to load its dialog. Nothing else under `__tolgee_` is read; a handshake nobody answers makes
 *   the SDK remove those slots and no other.
 * - The dialog's camera posts TOLGEE_TAKE_SCREENSHOT and waits 3 s for TOLGEE_SCREENSHOT_TAKEN with the image
 *   data URL as `data`; it shows the camera only after TOLGEE_PING is answered with TOLGEE_PONG.
 */

const API_URL = 'https://app.tolgee.io';
const PAGE_ORIGIN = 'https://site.example';
const SITE_KEY = 'tgpak_site_key';
const DELIVERED_KEY = 'tgpak_delivered_key';

type Release = { version: string; ready: LibConfig; dev: LibConfig };

const ready_5_33_2: LibConfig = {
  uiPresent: true,
  uiVersion: undefined,
  mode: 'production',
  config: { apiUrl: API_URL, apiKey: '' },
};

const ready_6_6_0: LibConfig = {
  uiPresent: true,
  uiVersion: undefined,
  mode: 'production',
  config: { apiUrl: API_URL, apiKey: '', branch: undefined },
};

const withSiteKey = (ready: LibConfig): LibConfig => ({
  ...ready,
  mode: 'development',
  config: { ...ready.config, apiKey: SITE_KEY },
});

const RELEASES: Release[] = [
  { version: '5.33.2', ready: ready_5_33_2, dev: withSiteKey(ready_5_33_2) },
  { version: '6.6.0', ready: ready_6_6_0, dev: withSiteKey(ready_6_6_0) },
  { version: '7.1.3', ready: ready_6_6_0, dev: withSiteKey(ready_6_6_0) },
];

// What a release from before the in-context UI (< 5.0) posts: a config and nothing about a UI.
const PRE_UI_READY = {
  config: { apiUrl: API_URL, apiKey: '' },
} as unknown as LibConfig;

// The three slots a published release reads, as it sees them.
const classicSlots = (store: SessionStore) => ({
  apiKey: store.getItem(API_KEY_SESSION_STORAGE),
  apiUrl: store.getItem(API_URL_SESSION_STORAGE),
  branch: store.getItem(BRANCH_SESSION_STORAGE),
});

const fakeStore = (
  init: Record<string, string> = {}
): SessionStore & { map: Map<string, string> } => {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
};

const runtime = vi.hoisted(() => ({
  listeners: [] as ((
    request: unknown,
    sender: unknown,
    sendResponse: (response: unknown) => void
  ) => unknown)[],
  sent: [] as { type: string; data: unknown }[],
  responses: {} as Record<string, unknown>,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: (listener: (typeof runtime.listeners)[number]) => {
          runtime.listeners.push(listener);
        },
      },
      sendMessage: async (message: { type: string; data: unknown }) => {
        runtime.sent.push(message);
        return runtime.responses[message.type];
      },
    },
  },
}));

type Posted = { type: string; data: unknown; targetOrigin: string };

/**
 * Loads the real content script against a page stand-in: a window that records what the script posts to the page
 * and dispatches what the page posts, the sessionStorage slots, and the runtime mock above for the worker side.
 */
const loadContentScript = async (store: SessionStore) => {
  const windowListeners: ((event: unknown) => void)[] = [];
  const posted: Posted[] = [];
  const reload = vi.fn();
  const fakeWindow: any = {
    origin: PAGE_ORIGIN,
    location: { origin: PAGE_ORIGIN, reload },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      expect(type).toBe('message');
      windowListeners.push(listener);
    },
    postMessage: (message: { type: string; data: unknown }, target: string) => {
      posted.push({ ...message, targetOrigin: target });
    },
  };
  fakeWindow.top = fakeWindow;
  fakeWindow.self = fakeWindow;
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('location', fakeWindow.location);
  vi.stubGlobal('sessionStorage', store);
  runtime.listeners.length = 0;
  runtime.sent.length = 0;
  runtime.responses = {};
  vi.resetModules();
  await import('./contentScript');

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const fromPage = async (type: string, data?: unknown) => {
    windowListeners.forEach((listener) =>
      listener({ source: fakeWindow, data: { type, data } })
    );
    await flush();
  };
  const fromWorker = (type: string, data?: unknown) =>
    new Promise<unknown>((resolve) => {
      runtime.listeners.forEach((listener) =>
        listener({ type, data }, {}, resolve)
      );
    });
  const sentTo = (type: string) =>
    runtime.sent.filter((m) => m.type === type).map((m) => m.data);
  return { posted, fromPage, fromWorker, sentTo, reload };
};

describe('content script contract with a published @tolgee/web release', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe.each(RELEASES)('@tolgee/web $version', ({ ready, dev }) => {
    it('answers the first TOLGEE_READY with TOLGEE_PLUGIN_READY, every later one with TOLGEE_PLUGIN_UPDATED, and hands the payload to the popup unchanged', async () => {
      const page = await loadContentScript(fakeStore());

      await page.fromPage('TOLGEE_READY', ready);
      expect(page.posted).toEqual([
        {
          type: 'TOLGEE_PLUGIN_READY',
          data: undefined,
          targetOrigin: PAGE_ORIGIN,
        },
      ]);
      expect(page.sentTo('TOLGEE_SET_STATE')).toEqual(['present']);
      expect(page.sentTo('TOLGEE_CONFIG_LOADED')).toEqual([ready]);

      await page.fromPage('TOLGEE_READY', ready);
      await page.fromPage('TOLGEE_READY', dev);
      expect(page.posted.map((m) => m.type)).toEqual([
        'TOLGEE_PLUGIN_READY',
        'TOLGEE_PLUGIN_UPDATED',
        'TOLGEE_PLUGIN_UPDATED',
      ]);
      expect(page.sentTo('TOLGEE_CONFIG_LOADED')).toEqual([ready, ready, dev]);
    });

    it('reports the page active once the url slot the release reads is set', async () => {
      const page = await loadContentScript(
        fakeStore({
          [API_KEY_SESSION_STORAGE]: DELIVERED_KEY,
          [API_URL_SESSION_STORAGE]: API_URL,
        })
      );
      await page.fromPage('TOLGEE_READY', ready);
      expect(page.sentTo('TOLGEE_SET_STATE')).toEqual(['active']);
    });

    it('re-sends the last handshake when the popup asks whether Tolgee is on the page', async () => {
      const page = await loadContentScript(fakeStore());
      await page.fromWorker('DETECT_TOLGEE');
      expect(page.sentTo('TOLGEE_CONFIG_LOADED')).toEqual([]);

      await page.fromPage('TOLGEE_READY', ready);
      await page.fromWorker('DETECT_TOLGEE');
      expect(page.sentTo('TOLGEE_CONFIG_LOADED')).toEqual([ready, ready]);
    });

    it('answers TOLGEE_PING with TOLGEE_PONG carrying the protocol version, which the release ignores', async () => {
      const page = await loadContentScript(fakeStore());
      await page.fromPage('TOLGEE_PING');
      expect(page.posted).toEqual([
        {
          type: 'TOLGEE_PONG',
          data: { protocolVersion: PROTOCOL_VERSION },
          targetOrigin: PAGE_ORIGIN,
        },
      ]);
    });

    it('relays TOLGEE_TAKE_SCREENSHOT to the worker and posts its data URL back as TOLGEE_SCREENSHOT_TAKEN', async () => {
      const page = await loadContentScript(fakeStore());
      runtime.responses['TOLGEE_TAKE_SCREENSHOT'] =
        'data:image/png;base64,AAAA';
      await page.fromPage('TOLGEE_TAKE_SCREENSHOT');
      expect(page.sentTo('TOLGEE_TAKE_SCREENSHOT')).toEqual([undefined]);
      expect(page.posted).toEqual([
        {
          type: 'TOLGEE_SCREENSHOT_TAKEN',
          data: 'data:image/png;base64,AAAA',
          targetOrigin: PAGE_ORIGIN,
        },
      ]);
    });

    it('forwards TOLGEE_OPEN_PLUGIN as an OPEN_POPUP request to the worker', async () => {
      const page = await loadContentScript(fakeStore());
      await page.fromPage('TOLGEE_OPEN_PLUGIN');
      expect(page.sentTo('OPEN_POPUP')).toEqual([undefined]);
      expect(page.posted).toEqual([]);
    });

    it('writes a delivered key into the slots the release reads and reloads the page so the release picks it up', async () => {
      const store = fakeStore();
      const page = await loadContentScript(store);
      await page.fromPage('TOLGEE_READY', ready);
      await page.fromWorker('SET_CREDENTIALS', {
        ...pageCredentials(
          {
            apiKey: DELIVERED_KEY,
            apiUrl: API_URL,
            branch: 'feat',
            projectId: 7,
            projectKey: '7',
          },
          ready
        ),
        pageOrigin: PAGE_ORIGIN,
      });
      expect(classicSlots(store)).toEqual({
        apiKey: DELIVERED_KEY,
        apiUrl: API_URL,
        branch: 'feat',
      });
      expect(store.getItem(EXTENSION_SESSION_STORAGE)).toBeNull();
      expect(page.reload).toHaveBeenCalledTimes(1);
      expect(page.sentTo('TOLGEE_SET_STATE')).toEqual(['present', 'active']);
      expect(await page.fromWorker('GET_CREDENTIALS')).toMatchObject({
        apiKey: DELIVERED_KEY,
        apiUrl: API_URL,
        branch: 'feat',
        session: null,
      });

      await page.fromWorker('SET_CREDENTIALS', { pageOrigin: PAGE_ORIGIN });
      expect(classicSlots(store)).toEqual({
        apiKey: null,
        apiUrl: null,
        branch: null,
      });
      expect(page.reload).toHaveBeenCalledTimes(2);
    });

    it('keeps a delivery meant for another origin out of the slots', async () => {
      const store = fakeStore();
      const page = await loadContentScript(store);
      await page.fromWorker('SET_CREDENTIALS', {
        apiKey: DELIVERED_KEY,
        apiUrl: API_URL,
        pageOrigin: 'https://other.example',
      });
      expect(store.map.size).toBe(0);
      expect(page.reload).not.toHaveBeenCalled();
    });
  });
});

describe('page-delivery slots as a published release reads them', () => {
  const ready = ready_6_6_0;
  const values = {
    apiKey: DELIVERED_KEY,
    apiUrl: API_URL,
    branch: 'feat',
    projectId: 7,
    projectKey: '7',
  };

  it("a key for a release without the proxied-request protocol goes to the page's three classic slots, with no session kind", () => {
    const delivery = pageCredentials(values, ready);
    expect(delivery).toMatchObject({
      apiKey: DELIVERED_KEY,
      apiUrl: API_URL,
      branch: 'feat',
      session: undefined,
    });
    const store = fakeStore();
    expect(writeCredentialsIfChanged(store, delivery)).toBe(true);
    expect(classicSlots(store)).toEqual({
      apiKey: DELIVERED_KEY,
      apiUrl: API_URL,
      branch: 'feat',
    });
    expect(store.map.has(EXTENSION_SESSION_STORAGE)).toBe(false);
  });

  it('removing the key clears the three classic slots', () => {
    const store = fakeStore();
    writeCredentialsIfChanged(store, pageCredentials(values, ready));
    expect(writeCredentialsIfChanged(store, pageCredentials(null, ready))).toBe(
      true
    );
    expect(classicSlots(store)).toEqual({
      apiKey: null,
      apiUrl: null,
      branch: null,
    });
    expect(store.map.size).toBe(0);
  });

  it('a proxied delivery never writes the key slot: a release reading only the classic slots finds no credentials', () => {
    const store = fakeStore();
    writeCredentialsIfChanged(
      store,
      pageCredentials(values, { ...ready, protocolVersion: PROTOCOL_VERSION })
    );
    expect(store.map.get(EXTENSION_SESSION_STORAGE)).toBe('apiKey');
    expect(classicSlots(store)).toEqual({
      apiKey: null,
      apiUrl: API_URL,
      branch: 'feat',
    });
  });

  it("the extension's own slots are additive: the classic slots read the same with and without them", () => {
    const plain = fakeStore();
    writeCredentialsIfChanged(plain, {
      apiKey: DELIVERED_KEY,
      apiUrl: API_URL,
      branch: 'feat',
    });
    const withExtras = fakeStore();
    writeCredentialsIfChanged(withExtras, {
      apiKey: DELIVERED_KEY,
      apiUrl: API_URL,
      branch: 'feat',
      projectId: 7,
      projectKey: '7',
      editing: 'off',
    });
    expect(classicSlots(withExtras)).toEqual(classicSlots(plain));
    expect([...withExtras.map.keys()].sort()).toEqual(
      [
        API_KEY_SESSION_STORAGE,
        API_URL_SESSION_STORAGE,
        BRANCH_SESSION_STORAGE,
        PROJECT_ID_SESSION_STORAGE,
        PROJECT_KEY_SESSION_STORAGE,
        EDITING_SESSION_STORAGE,
      ].sort()
    );
  });

  it('the classic slots survive a release sweeping only what it knows, and the extension still reads its own', () => {
    // What every published release removes after a handshake nobody answered (its clearSessionStorage).
    const store = fakeStore();
    writeCredentialsIfChanged(store, {
      apiKey: DELIVERED_KEY,
      apiUrl: API_URL,
      branch: 'feat',
      projectId: 7,
      projectKey: '7',
    });
    [
      API_KEY_SESSION_STORAGE,
      API_URL_SESSION_STORAGE,
      BRANCH_SESSION_STORAGE,
    ].forEach((slot) => store.removeItem(slot));
    expect(classicSlots(store)).toEqual({
      apiKey: null,
      apiUrl: null,
      branch: null,
    });
    // Writing the same delivery again puts the classic slots back and counts as a change (a reload).
    expect(
      writeCredentialsIfChanged(store, {
        apiKey: DELIVERED_KEY,
        apiUrl: API_URL,
        branch: 'feat',
        projectId: 7,
        projectKey: '7',
      })
    ).toBe(true);
    expect(classicSlots(store).apiKey).toBe(DELIVERED_KEY);
  });
});

describe('popup classification of a published release', () => {
  describe.each(RELEASES)('@tolgee/web $version', ({ ready, dev }) => {
    it('is present, declares no project, gets its key handed to the page and cannot sign in', () => {
      const state = changeLibConfig(initialState, ready, 0);
      expect(state.tolgeePresent).toBe('present');
      expect(state.libConfig).toEqual(ready);
      expect(state.values).toMatchObject({ apiUrl: API_URL });
      expect(declaredProjectId(ready)).toBeUndefined();
      expect(sdkSupportsProxy(ready)).toBe(false);
      expect(credentialDelivery(ready)).toBe('page');
      expect(
        sdkTooOldFor({
          libConfig: ready,
          hasSession: false,
          siteKeyScreen: false,
          activeValues: { apiUrl: API_URL },
        })
      ).toBe(true);
      expect(siteKeyFromCode(ready)).toBeUndefined();
    });

    it("in development mode reports the site's own key, which the page keeps using", () => {
      const state = changeLibConfig(initialState, dev, 0);
      expect(state.tolgeePresent).toBe('present');
      expect(siteKeyFromCode(dev)).toBe(SITE_KEY);
      expect(
        sdkTooOldFor({
          libConfig: dev,
          hasSession: false,
          siteKeyScreen: true,
          activeValues: { apiUrl: API_URL, apiKey: SITE_KEY },
        })
      ).toBe(false);
    });
  });

  it('a release from before the in-context UI (no uiPresent) is legacy', () => {
    const state = changeLibConfig(initialState, PRE_UI_READY, 0);
    expect(state.tolgeePresent).toBe('legacy');
    expect(credentialDelivery(PRE_UI_READY)).toBe('page');
  });
});
