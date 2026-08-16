import browser from 'webextension-polyfill';
import { ScreenshotMaker } from './ScreenshotMaker';
import { RuntimeMessage } from '../content/Messages';
import { login } from '../oauth/oauthClient';
import {
  clearSessionByKey,
  clearSessionIfUnreferenced,
  ensureFreshToken,
  getValidAccessToken,
  isTokenFresh,
  loadSession,
  resolveSessionForTab,
  saveSession,
  sessionKey,
  StoredSession,
} from '../oauth/tokenStore';
import { safeOrigin, sameOrigin } from '../oauth/url';
import { projectKeyForToken } from '../oauth/tokenScope';
import { loadOAuthMarker, storeOAuthMarker } from '../oauth/marker';

type State = 'present' | 'active' | 'inactive';

const REFRESH_ALARM = 'tolgee-oauth-refresh';

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message as RuntimeMessage;
  switch (type) {
    case 'TOLGEE_TAKE_SCREENSHOT':
      ScreenshotMaker.capture(sender.tab!.windowId!).then((data) => {
        sendResponse(data);
      });
      return true;
    case 'TOLGEE_SET_STATE':
      setStateIcon(data, sender.tab!.id!);
      sendResponse({});
      break;
    case 'OPEN_POPUP':
      // Best effort: chrome.action.openPopup() is only available on newer Chrome; if it's missing or the call is
      // refused, the in-context alert still tells the user to click the extension icon.
      (browser.action as { openPopup?: () => Promise<void> })
        .openPopup?.()
        .catch(() => undefined);
      sendResponse({});
      break;
    case 'OAUTH_LOGIN':
      connect(data)
        .then((accessToken) => sendResponse({ accessToken }))
        .catch((e) => {
          console.error('[tolgee] login failed', e);
          sendResponse({ error: String(e) });
        });
      return true;
    case 'OAUTH_GET_TOKEN':
      getValidAccessToken(data.apiUrl, data.projectId, {
        soleOriginFallback: true,
      })
        .then((accessToken) => sendResponse({ accessToken }))
        .catch((e) => {
          console.error('[tolgee] token lookup failed', e);
          sendResponse({ accessToken: null, error: String(e) });
        });
      return true;
    case 'OAUTH_LOGOUT':
      disconnect(data)
        .then(() => sendResponse({}))
        .catch((e) => {
          console.error('[tolgee] logout failed', e);
          sendResponse({ error: String(e) });
        });
      return true;
    case 'OAUTH_TAB_CONNECTED':
      // Respond only after the registration resolves: returning true keeps the MV3 worker alive for the async work, so a
      // torn-down worker can't drop the registration and leave the tab without token refreshes.
      registerConnectedTab(
        sender.tab?.id,
        safeOrigin(sender.tab?.url),
        data.apiUrl
      )
        .catch((e) => console.error('[tolgee] tab register failed', e))
        .finally(() => sendResponse({}));
      return true;
    default:
      sendResponse({});
  }
});

const setStateIcon = (state: State, tabId: number) => {
  browser.action.setIcon({
    path: { 128: `/icons/${state}.png` },
    tabId,
  });
};

const INJECTED_TABS_KEY = 'injectedTabs';
type InjectedTab = {
  apiUrl: string;
  pageOrigin: string;
  projectKey: string;
};
type InjectedTabs = Record<string, InjectedTab>;

// Register the tab from the unforgeable marker, never the page's message: the marker's projectKey pins WHICH keyed
// session serves this tab, so a connected origin can't claim another project's projectId to harvest its token.
const registerConnectedTab = async (
  tabId: number | undefined,
  pageOrigin: string | undefined,
  apiUrl: string
) => {
  if (tabId == null || !pageOrigin) {
    return;
  }
  const marker = await loadOAuthMarker(pageOrigin);
  if (marker?.projectKey && sameOrigin(marker.apiUrl, apiUrl)) {
    await recordInjectedTab(
      tabId,
      marker.apiUrl,
      pageOrigin,
      marker.projectKey
    );
  }
};

const recordInjectedTab = (
  tabId: number,
  apiUrl: string,
  pageOrigin: string,
  projectKey: string
) =>
  withRegistry(async (tabs) => {
    tabs[tabId] = { apiUrl, pageOrigin, projectKey };
    await saveInjectedTabs(tabs);
  });

const forgetInjectedTab = (tabId: number) =>
  withRegistry(async (tabs) => {
    if (tabs[tabId]) {
      await dropTab(tabs, tabId);
    }
  });

// Drop every registered tab on a given page origin, so a disconnected site stops receiving refreshed-token pushes.
const forgetInjectedTabsForOrigin = (pageOrigin: string) =>
  withRegistry(async (tabs) => {
    const survivors = Object.entries(tabs).filter(
      ([, tab]) => tab.pageOrigin !== pageOrigin
    );
    if (survivors.length !== Object.keys(tabs).length) {
      await saveInjectedTabs(Object.fromEntries(survivors));
    }
  });

const dropTab = (tabs: InjectedTabs, tabId: number) => {
  delete tabs[tabId];
  return saveInjectedTabs(tabs);
};

const loadInjectedTabs = async (): Promise<InjectedTabs> =>
  ((await browser.storage.local.get(INJECTED_TABS_KEY))[
    INJECTED_TABS_KEY
  ] as InjectedTabs) ?? {};

const saveInjectedTabs = (tabs: InjectedTabs) =>
  browser.storage.local.set({ [INJECTED_TABS_KEY]: tabs });

// Serialize load→mutate→store so concurrent tab events can't read the same snapshot and clobber each other's write.
let registryQueue: Promise<unknown> = Promise.resolve();
const withRegistry = <T>(
  fn: (tabs: InjectedTabs) => Promise<T> | T
): Promise<T> => {
  const run = registryQueue.then(async () => fn(await loadInjectedTabs()));
  registryQueue = run.catch(() => undefined);
  return run;
};

browser.tabs.onRemoved.addListener((tabId) => {
  forgetInjectedTab(tabId);
});
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }
  withRegistry(async (tabs) => {
    const tab = tabs[tabId];
    if (tab && tab.pageOrigin !== safeOrigin(changeInfo.url)) {
      await dropTab(tabs, tabId);
    }
  });
});
// Tab ids are reissued after a restart, so a persisted entry could misroute a token to an unrelated new tab.
browser.runtime.onStartup.addListener(() => {
  browser.storage.local.remove(INJECTED_TABS_KEY);
});

const disconnect = async (data: {
  apiUrl: string;
  authToken?: string;
  projectId?: number;
  pageOrigin?: string;
}) => {
  const projectKey = data.authToken
    ? projectKeyForToken(data.authToken)
    : (await loadSession(data.apiUrl, data.projectId))?.projectKey;
  if (data.pageOrigin) {
    await forgetInjectedTabsForOrigin(data.pageOrigin);
  }
  if (projectKey === undefined) {
    return;
  }
  if (data.pageOrigin) {
    await clearSessionIfUnreferenced(data.apiUrl, projectKey, data.pageOrigin);
  } else {
    await clearSessionByKey(data.apiUrl, projectKey);
  }
};

const connect = async (data: {
  apiUrl: string;
  projectId?: number;
  tabId?: number;
}): Promise<string> => {
  let accessToken = await getValidAccessToken(data.apiUrl, data.projectId);
  if (!accessToken) {
    const tokens = await login(data.apiUrl, data.projectId);
    await saveSession(data.apiUrl, tokens);
    accessToken = tokens.accessToken;
  }
  const pageOrigin = safeOrigin(
    data.tabId != null
      ? (await browser.tabs.get(data.tabId).catch(() => undefined))?.url
      : undefined
  );
  if (data.tabId != null && pageOrigin) {
    await injectCredentials(data.tabId, {
      apiUrl: data.apiUrl,
      authToken: accessToken,
      projectId: data.projectId,
      pageOrigin,
    });
    await storeOAuthMarker(pageOrigin, {
      apiUrl: data.apiUrl,
      projectId: data.projectId,
      projectKey: projectKeyForToken(accessToken),
    });
  }
  return accessToken;
};

const injectCredentials = async (
  tabId: number,
  data: {
    apiUrl: string;
    authToken: string;
    projectId?: number;
    pageOrigin: string;
  }
) => {
  await browser.tabs
    .sendMessage(tabId, { type: 'SET_CREDENTIALS', data })
    .catch(() => undefined);
};

// Create the alarm only when absent: re-creating it resets the schedule, and MV3 re-runs this on every worker wake.
const ensureRefreshAlarm = async () => {
  if (!(await browser.alarms.get(REFRESH_ALARM))) {
    await browser.alarms.create(REFRESH_ALARM, { periodInMinutes: 10 });
  }
};
ensureRefreshAlarm();
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) {
    return;
  }
  // Refresh only sessions a live tab resolves to (1:1), so an abandoned session with no owning tab isn't kept alive.
  const owning = new Map<string, StoredSession>();
  for (const tab of Object.values(await loadInjectedTabs())) {
    const session = await resolveSessionForTab(tab);
    if (session) {
      owning.set(sessionKey(session), session);
    }
  }
  for (const session of owning.values()) {
    if (isTokenFresh(session)) {
      continue;
    }
    const accessToken = await ensureFreshToken(session);
    if (accessToken) {
      await pushTokenToSession(session, accessToken);
    }
  }
});

const pushTokenToSession = async (
  session: StoredSession,
  accessToken: string
) => {
  const key = sessionKey(session);
  const injected = Object.entries(await loadInjectedTabs());
  await Promise.all(
    injected.map(async ([tabId, tab]) => {
      const owning = await resolveSessionForTab(tab);
      if (!owning || sessionKey(owning) !== key) {
        return;
      }
      await browser.tabs
        .sendMessage(Number(tabId), {
          type: 'UPDATE_AUTH_TOKEN',
          data: {
            apiUrl: session.apiUrl,
            projectKey: session.projectKey,
            authToken: accessToken,
            pageOrigin: tab.pageOrigin,
          },
        })
        .catch(() => undefined);
    })
  );
};
