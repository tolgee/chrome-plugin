import browser from 'webextension-polyfill';
import { ScreenshotMaker } from './ScreenshotMaker';
import { RuntimeMessage } from '../content/Messages';
import { login } from '../oauth/oauthClient';
import {
  clearSession,
  getValidAccessToken,
  loadAllSessions,
  saveSession,
} from '../oauth/tokenStore';
import { OAUTH_REFRESH_SKEW_MS } from '../constants';

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
          console.error('[tolgee-oauth] login failed', e);
          sendResponse({ error: String(e) });
        });
      return true;
    case 'OAUTH_GET_TOKEN':
      getValidAccessToken(data.apiUrl, data.projectId)
        .then((accessToken) => sendResponse({ accessToken }))
        .catch((e) => {
          console.error('[tolgee-oauth] token lookup failed', e);
          sendResponse({ accessToken: null, error: String(e) });
        });
      return true;
    case 'OAUTH_LOGOUT':
      clearSession(data.apiUrl, data.projectId)
        .then(() => sendResponse({}))
        .catch((e) => {
          console.error('[tolgee-oauth] logout failed', e);
          sendResponse({ error: String(e) });
        });
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

// Reuse an existing usable session before launching the OAuth flow: a matching concrete-project session, or an
// all-projects one, connects a second site on the same backend with no extra round trip — this is what makes an
// all-projects login "just work" everywhere. Only when nothing serves the requested project do we run the flow.
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
  // launchWebAuthFlow steals focus, which closes the popup before it can push credentials to the page, so inject from
  // here. data.tabId is the tab the popup was acting on, captured before the auth window opened.
  if (data.tabId != null) {
    await injectCredentials(data.tabId, {
      apiUrl: data.apiUrl,
      authToken: accessToken,
      projectId: data.projectId,
    });
  }
  return accessToken;
};

// Inject the full credential set into a page on connect (the content script writes them to sessionStorage and reloads
// so the SDK picks them up). Runs from the service worker because the popup is already gone by the time login resolves.
const injectCredentials = async (
  tabId: number,
  data: { apiUrl: string; authToken: string; projectId?: number }
) => {
  await browser.tabs
    .sendMessage(tabId, { type: 'SET_CREDENTIALS', data })
    .catch(() => undefined);
};

// Keep stored sessions fresh so the popup and the injected page token don't expire mid-use. Rotation means each
// refresh mints a new access + refresh token; getValidAccessToken persists them and pushes the access token to tabs.
// This top-level code re-runs every time the MV3 worker wakes; re-creating an existing alarm resets its schedule, so a
// worker that wakes more often than the period would never let the alarm fire — only create it when it's absent.
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
  const sessions = await loadAllSessions();
  for (const session of sessions) {
    if (session.expiresAt - OAUTH_REFRESH_SKEW_MS > Date.now()) {
      continue;
    }
    // Passing the session's own project scope refreshes exactly this session (a concrete id finds it, '*' the
    // all-projects one), so rotating one project's token never disturbs another's.
    const accessToken = await getValidAccessToken(
      session.apiUrl,
      session.projectKey
    );
    if (accessToken) {
      await pushTokenToTabs(session.apiUrl, session.projectKey, accessToken);
    }
  }
});

// Update the injected access token in every tab whose applied backend and project the refreshed session serves, without
// reloading the page. An all-projects ('*') session serves any project; a concrete session only its own.
const pushTokenToTabs = async (
  apiUrl: string,
  projectKey: string,
  accessToken: string
) => {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id == null
        ? undefined
        : browser.tabs
            .sendMessage(tab.id, {
              type: 'UPDATE_AUTH_TOKEN',
              data: { apiUrl, projectKey, authToken: accessToken },
            })
            .catch(() => undefined)
    )
  );
};
