import browser from 'webextension-polyfill';
import {
  OAUTH_REQUEST_TIMEOUT_MS,
  REFRESH_ALARM_PERIOD_MINUTES,
} from '../constants';
import { ScreenshotMaker } from './ScreenshotMaker';
import { RuntimeMessage } from '../content/Messages';
import { login, revoke } from '../oauth/oauthClient';
import {
  clearSessionByKey,
  ensureFreshToken,
  isTokenFresh,
  loadSession,
  resolveSessionForTab,
  saveSession,
  sessionKey,
  StoredSession,
} from '../oauth/tokenStore';
import { normalizeUrl, safeOrigin, sameOrigin } from '../oauth/url';
import {
  confirmsProjectInaccessible,
  confirmsTokenUnusable,
  projectKeyFor,
} from '../oauth/sessionRules';
import {
  clearMarker,
  isSessionReferencedByAnyOrigin,
  loadOAuthMarker,
  storeOAuthMarker,
} from '../oauth/marker';
import {
  clearAllTabs,
  dropTabIfNavigatedAway,
  loadTabEntries,
  registerTab,
  unregisterTab,
  unregisterTabsForOrigin,
} from './tabRegistry';

type State = 'present' | 'active' | 'inactive';

export const REFRESH_ALARM = 'tolgee-oauth-refresh';

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
      // Best effort: chrome.action.openPopup() is only available on newer Chrome.
      (browser.action as { openPopup?: () => Promise<void> })
        .openPopup?.()
        .catch(() => undefined);
      sendResponse({});
      break;
    case 'OAUTH_LOGIN':
      respondAsync(sendResponse, connect(data), 'login', (accessToken) => ({
        accessToken,
      }));
      return true;
    case 'OAUTH_GET_TOKEN':
      respondAsync(
        sendResponse,
        getTokenAndPush(data.apiUrl, requesterOrigin(sender, data.pageOrigin)),
        'token lookup',
        (accessToken) => ({ accessToken }),
        () => ({ accessToken: null })
      );
      return true;
    case 'OAUTH_LOGOUT':
      respondAsync(
        sendResponse,
        disconnect({ pageOrigin: requesterOrigin(sender, data.pageOrigin) }),
        'logout',
        () => ({})
      );
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
    case 'OAUTH_TAB_DISCONNECTED':
      unregisterTabIfKnown(sender.tab?.id)
        .catch((e) => console.error('[tolgee] tab unregister failed', e))
        .finally(() => sendResponse({}));
      return true;
    default:
      sendResponse({});
  }
});

// A tab can only ever act for its own origin; a claimed pageOrigin is honoured solely for the extension's own pages
// (the popup). Those are told apart by their URL, not by a missing sender.tab: the action popup has none, but the
// same page opened in a tab does.
const requesterOrigin = (
  sender: { url?: string; tab?: { url?: string } },
  claimed?: string
): string | undefined =>
  sender.tab && !isExtensionPage(sender.url)
    ? safeOrigin(sender.tab.url)
    : claimed;

const isExtensionPage = (url?: string): boolean =>
  Boolean(url?.startsWith(browser.runtime.getURL('')));

const setStateIcon = (state: State, tabId: number) => {
  browser.action.setIcon({
    path: { 128: `/icons/${state}.png` },
    tabId,
  });
};

const respondAsync = <T>(
  sendResponse: (response: unknown) => void,
  work: Promise<T>,
  label: string,
  toSuccess: (value: T) => Record<string, unknown>,
  toError: (e: unknown) => Record<string, unknown> = () => ({})
) => {
  work
    .then((value) => sendResponse(toSuccess(value)))
    .catch((e) => {
      console.error(`[tolgee] ${label} failed`, e);
      sendResponse({ ...toError(e), error: String(e) });
    });
};

// Registers from the marker (see oauth/marker.ts), never from the page's own message.
const registerConnectedTab = async (
  tabId: number | undefined,
  pageOrigin: string | undefined,
  apiUrl: string
) => {
  if (tabId == null || !pageOrigin) {
    return;
  }
  const marker = await loadOAuthMarker(pageOrigin);
  if (!marker?.projectKey || !sameOrigin(marker.apiUrl, apiUrl)) {
    return;
  }
  await registerTab(tabId, {
    apiUrl: marker.apiUrl,
    pageOrigin,
    projectKey: marker.projectKey,
  });
  // Always push the current token on (re)registration, even if storage already looks fresh: the tab's own
  // sessionStorage may hold an older one (browser restart with multiple tabs, or a tab that navigated away and
  // back while another tab kept the session refreshed), and there is no way to know that without asking it to
  // overwrite unconditionally. ensureFreshToken is cheap when the session is already fresh — no network call.
  const session = await resolveSessionForTab({
    apiUrl: marker.apiUrl,
    projectKey: marker.projectKey,
  });
  if (session) {
    const accessToken = await ensureFreshToken(session);
    if (accessToken) {
      await pushTokenToSession(session, accessToken);
    }
  }
};

const unregisterTabIfKnown = (tabId: number | undefined): Promise<void> =>
  tabId == null ? Promise.resolve() : unregisterTab(tabId);

const connect = async (data: {
  apiUrl: string;
  projectId?: number;
  tabId?: number;
}): Promise<string> => {
  // The popup only ever sends this with a declared project (LoginTab disables Connect otherwise); a session keyed
  // by "no project" doesn't exist in this design, so this is a hard precondition, not a fallback case.
  if (data.projectId === undefined) {
    throw new Error('Tolgee: cannot connect without a project id');
  }
  const projectId = data.projectId;

  const requestingOrigin = await tabOrigin(data.tabId);
  const { session, accessToken } = await acquireSession(data.apiUrl, projectId);
  // Push to any tab already registered for this session before touching the connecting tab, so a refresh triggered
  // here (rather than by the alarm) does not leave a second open tab holding a token that was just superseded.
  await pushTokenToSession(session, accessToken);

  if (data.tabId == null || !requestingOrigin) {
    return accessToken;
  }
  if ((await tabOrigin(data.tabId)) !== requestingOrigin) {
    throw new Error(
      'Tolgee: the page navigated away during sign-in, please try again'
    );
  }

  await reassignOriginMarker(requestingOrigin, data.apiUrl, projectId);
  await injectCredentials(data.tabId, {
    apiUrl: data.apiUrl,
    authToken: accessToken,
    projectId,
    projectKey: projectKeyFor(projectId),
    pageOrigin: requestingOrigin,
  });
  return accessToken;
};

const tabOrigin = async (tabId?: number): Promise<string | undefined> =>
  tabId == null
    ? undefined
    : safeOrigin((await browser.tabs.get(tabId).catch(() => undefined))?.url);

const loginAndSave = async (
  apiUrl: string,
  projectId: number
): Promise<{ session: StoredSession; accessToken: string }> => {
  const tokens = await login(apiUrl, projectId);
  const session = await saveSession(apiUrl, tokens, projectId);
  return { session, accessToken: tokens.accessToken };
};

// ensureFreshToken alone only proves a token is unexpired, not that it can still reach this project or that the
// grant itself hasn't been revoked entirely — either can happen server-side after connect, hence serverRejectsSession.
const acquireSession = async (
  apiUrl: string,
  projectId: number
): Promise<{ session: StoredSession; accessToken: string }> => {
  const existing = await loadSession(apiUrl, projectId);
  if (!existing) {
    return loginAndSave(apiUrl, projectId);
  }
  const reusableToken = await ensureFreshToken(existing);
  if (!reusableToken) {
    const replacement = await loginAndSave(apiUrl, projectId);
    await revokeSession(existing);
    return replacement;
  }
  if (!(await serverRejectsSession(apiUrl, projectId, reusableToken))) {
    return { session: existing, accessToken: reusableToken };
  }
  await clearSessionByKey(apiUrl, existing.projectKey);
  await revokeSession(existing);
  return loginAndSave(apiUrl, projectId);
};

const serverRejectsSession = async (
  apiUrl: string,
  projectId: number,
  accessToken: string
): Promise<boolean> => {
  try {
    const res = await fetch(
      `${normalizeUrl(apiUrl)}/v2/projects/${projectId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
      }
    );
    return (
      !res.ok &&
      (confirmsProjectInaccessible(res.status) ||
        confirmsTokenUnusable(res.status))
    );
  } catch {
    return false;
  }
};

const reassignOriginMarker = async (
  pageOrigin: string,
  apiUrl: string,
  projectId: number
) => {
  const projectKey = projectKeyFor(projectId);
  const previousMarker = await loadOAuthMarker(pageOrigin);
  await storeOAuthMarker(pageOrigin, { apiUrl, projectId, projectKey });
  if (
    previousMarker?.projectKey &&
    !(
      sameOrigin(previousMarker.apiUrl, apiUrl) &&
      previousMarker.projectKey === projectKey
    )
  ) {
    await endSessionIfUnreferenced(
      previousMarker.apiUrl,
      previousMarker.projectKey
    );
  }
};

const disconnect = async (data: { pageOrigin?: string }) => {
  if (!data.pageOrigin) {
    return;
  }
  const marker = await loadOAuthMarker(data.pageOrigin);
  // The popup only clears its own (active) tab's sessionStorage; a session shared with another origin survives
  // Disconnect, so any OTHER tab of this origin would otherwise keep a live, still-working token indefinitely.
  await clearTabCredentials(data.pageOrigin);
  await unregisterTabsForOrigin(data.pageOrigin);
  await clearMarker(data.pageOrigin);
  if (marker?.projectKey) {
    await endSessionIfUnreferenced(marker.apiUrl, marker.projectKey);
  }
};

const clearTabCredentials = async (pageOrigin: string) => {
  const injected = await loadTabEntries();
  await Promise.all(
    injected
      .filter(([, tab]) => tab.pageOrigin === pageOrigin)
      .map(([tabId]) =>
        browser.tabs
          .sendMessage(Number(tabId), {
            type: 'SET_CREDENTIALS',
            data: { pageOrigin },
          })
          .catch(() => undefined)
      )
  );
};

// A session can be shared by more than one origin on the same backend, so it is only cleared — and only then
// revoked server-side — once no origin's marker still references it.
const endSessionIfUnreferenced = async (apiUrl: string, projectKey: string) => {
  const session = await resolveSessionForTab({ apiUrl, projectKey });
  if (!session) {
    return;
  }
  if (await isSessionReferencedByAnyOrigin(apiUrl, projectKey)) {
    return;
  }
  await clearSessionByKey(apiUrl, projectKey);
  await revokeSession(session);
};

const revokeSession = (session: StoredSession) =>
  revoke(session.apiUrl, session.refreshToken ?? session.accessToken).catch(
    (e) => console.warn('[tolgee] revoke failed', e)
  );

const getTokenAndPush = async (
  apiUrl: string,
  pageOrigin?: string
): Promise<string | null> => {
  if (!pageOrigin) {
    return null;
  }
  const marker = await loadOAuthMarker(pageOrigin);
  if (!marker?.projectKey || !sameOrigin(marker.apiUrl, apiUrl)) {
    return null;
  }
  const session = await resolveSessionForTab({
    apiUrl: marker.apiUrl,
    projectKey: marker.projectKey,
  });
  if (!session) {
    return null;
  }
  const accessToken = await ensureFreshToken(session);
  if (accessToken) {
    await pushTokenToSession(session, accessToken);
  }
  return accessToken;
};

const injectCredentials = async (
  tabId: number,
  data: {
    apiUrl: string;
    authToken: string;
    projectId?: number;
    projectKey: string;
    pageOrigin: string;
  }
) => {
  await browser.tabs
    .sendMessage(tabId, { type: 'SET_CREDENTIALS', data })
    .catch(() => undefined);
};

const pushTokenToSession = async (
  session: StoredSession,
  accessToken: string
) => {
  const key = sessionKey(session);
  const injected = await loadTabEntries();
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

browser.tabs.onRemoved.addListener((tabId) => {
  unregisterTab(tabId);
});
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    dropTabIfNavigatedAway(tabId, changeInfo.url);
  }
});
browser.runtime.onStartup.addListener(() => {
  clearAllTabs();
});

// MV3 re-runs this on every worker wake; re-creating an existing alarm would reset its schedule.
export const ensureRefreshAlarm = async () => {
  if (!(await browser.alarms.get(REFRESH_ALARM))) {
    await browser.alarms.create(REFRESH_ALARM, {
      periodInMinutes: REFRESH_ALARM_PERIOD_MINUTES,
    });
  }
};
ensureRefreshAlarm();
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) {
    return;
  }
  // An abandoned session with no owning tab is not kept alive.
  const owning = new Map<string, StoredSession>();
  for (const [, tab] of await loadTabEntries()) {
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
