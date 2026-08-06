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
    case 'OAUTH_LOGIN':
      login(data.apiUrl, data.projectId)
        .then(async (tokens) => {
          await saveSession(data.apiUrl, tokens);
          sendResponse({ accessToken: tokens.accessToken });
        })
        .catch((e) => sendResponse({ error: String(e) }));
      return true;
    case 'OAUTH_GET_TOKEN':
      getValidAccessToken(data.apiUrl).then((accessToken) =>
        sendResponse({ accessToken })
      );
      return true;
    case 'OAUTH_LOGOUT':
      clearSession(data.apiUrl).then(() => sendResponse({}));
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

// Keep stored sessions fresh so the popup and the injected page token don't expire mid-use. Rotation means each
// refresh mints a new access + refresh token; getValidAccessToken persists them and pushes the access token to tabs.
browser.alarms.create(REFRESH_ALARM, { periodInMinutes: 10 });
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
