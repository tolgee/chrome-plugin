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
      login(data.apiUrl, data.projectId)
        .then(async (tokens) => {
          await saveSession(data.apiUrl, tokens);
          // launchWebAuthFlow steals focus, which closes the popup before it can push credentials to the page, so
          // inject from here. data.tabId is the tab the popup was acting on, captured before the auth window opened.
          if (data.tabId != null) {
            await injectCredentials(data.tabId, {
              apiUrl: data.apiUrl,
              authToken: tokens.accessToken,
              projectId: data.projectId,
            });
          }
          sendResponse({ accessToken: tokens.accessToken });
        })
        .catch((e) => {
          console.error('[tolgee-oauth] login failed', e);
          sendResponse({ error: String(e) });
        });
      return true;
    case 'OAUTH_GET_TOKEN':
      getValidAccessToken(data.apiUrl)
        .then((accessToken) => sendResponse({ accessToken }))
        .catch((e) => {
          console.error('[tolgee-oauth] token lookup failed', e);
          sendResponse({ accessToken: null, error: String(e) });
        });
      return true;
    case 'OAUTH_LOGOUT':
      clearSession(data.apiUrl)
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
    const accessToken = await getValidAccessToken(session.apiUrl);
    if (accessToken) {
      await pushTokenToTabs(session.apiUrl, accessToken);
    }
  }
});

// Update the injected access token in every tab whose applied backend matches, without reloading the page.
const pushTokenToTabs = async (apiUrl: string, accessToken: string) => {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id == null
        ? undefined
        : browser.tabs
            .sendMessage(tab.id, {
              type: 'UPDATE_AUTH_TOKEN',
              data: { apiUrl, authToken: accessToken },
            })
            .catch(() => undefined)
    )
  );
};
