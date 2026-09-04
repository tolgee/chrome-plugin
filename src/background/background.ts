import browser from 'webextension-polyfill';
import { OAUTH_REQUEST_TIMEOUT_MS } from '../constants';
import { ScreenshotMaker } from './ScreenshotMaker';
import {
  authorizedFetch,
  handleApiRequest,
  handleScreenshotUpload,
} from './apiProxy';
import { requesterOrigin } from './sender';
import { RuntimeMessage } from '../content/Messages';
import { login, revoke } from '../oauth/oauthClient';
import {
  clearSessionByKey,
  ensureFreshToken,
  loadSession,
  resolveSessionForTab,
  saveSession,
  StoredSession,
} from '../oauth/tokenStore';
import { safeOrigin, sameOrigin } from '../oauth/url';
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

type State = 'present' | 'active' | 'inactive';

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message as RuntimeMessage;
  switch (type) {
    case 'TOLGEE_TAKE_SCREENSHOT':
      ScreenshotMaker.capture(sender.tab!.windowId!).then((data) => {
        sendResponse(data);
      });
      return true;
    case 'TOLGEE_API_REQUEST':
      handleApiRequest(data, sender)
        .catch((e) => ({
          error: { kind: 'unavailable', message: errorMessage(e) },
        }))
        .then(sendResponse);
      return true;
    case 'TOLGEE_SCREENSHOT_UPLOAD':
      handleScreenshotUpload(data, sender)
        .catch((e) => ({
          error: { kind: 'unavailable', message: errorMessage(e) },
        }))
        .then(sendResponse);
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
      respondAsync(sendResponse, connect(data), 'login', () => ({
        connected: true,
      }));
      return true;
    case 'OAUTH_SESSION_STATE':
      respondAsync(
        sendResponse,
        sessionState(data, requesterOrigin(sender, data.pageOrigin)),
        'session lookup',
        (active) => ({ active }),
        () => ({ active: false })
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
      sendResponse({ ...toError(e), error: errorMessage(e) });
    });
};

// The popup shows this text as-is; String(error) would prefix it with the error's class name.
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const connect = async (data: {
  apiUrl: string;
  projectId?: number;
  tabId?: number;
}): Promise<void> => {
  // The popup only ever sends this with a declared project (LoginTab disables Connect otherwise); a session keyed
  // by "no project" doesn't exist in this design, so this is a hard precondition, not a fallback case.
  if (data.projectId === undefined) {
    throw new Error('Tolgee: cannot connect without a project id');
  }
  const projectId = data.projectId;

  const requestingOrigin = await tabOrigin(data.tabId);
  await acquireSession(data.apiUrl, projectId);

  if (data.tabId == null || !requestingOrigin) {
    return;
  }
  if ((await tabOrigin(data.tabId)) !== requestingOrigin) {
    throw new Error(
      'Tolgee: the page navigated away during sign-in, please try again'
    );
  }

  await reassignOriginMarker(requestingOrigin, data.apiUrl, projectId);
  await injectCredentials(data.tabId, {
    apiUrl: data.apiUrl,
    oauth: true,
    projectId,
    projectKey: projectKeyFor(projectId),
    pageOrigin: requestingOrigin,
  });
};

const tabOrigin = async (tabId?: number): Promise<string | undefined> =>
  tabId == null
    ? undefined
    : safeOrigin((await browser.tabs.get(tabId).catch(() => undefined))?.url);

const loginAndSave = async (
  apiUrl: string,
  projectId: number
): Promise<StoredSession> => {
  const tokens = await login(apiUrl, projectId);
  return saveSession(apiUrl, tokens, projectId);
};

// ensureFreshToken alone only proves a token is unexpired, not that it can still reach this project or that the
// grant itself hasn't been revoked entirely — either can happen server-side after connect, hence serverRejectsSession.
const acquireSession = async (
  apiUrl: string,
  projectId: number
): Promise<StoredSession> => {
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
    return existing;
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
    const res = await authorizedFetch(
      apiUrl,
      `/v2/projects/${projectId}`,
      accessToken,
      {
        method: 'GET',
        headers: {},
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
  // The origin's marker goes first: a tab reloads as soon as it is told to clear, and the popup re-applies whatever
  // OAUTH_SESSION_STATE still finds for the origin when the reloaded page handshakes.
  await clearMarker(data.pageOrigin);
  // The popup only clears its own (active) tab's sessionStorage; every other tab of this origin would otherwise
  // keep sending through a session that may live on for another origin.
  await clearTabCredentials(data.pageOrigin);
  if (marker?.projectKey) {
    await endSessionIfUnreferenced(marker.apiUrl, marker.projectKey);
  }
};

// Filtered here, not through a `url` match pattern: Firefox match patterns reject ports, and a dev origin with a
// port is the normal case.
const clearTabCredentials = async (pageOrigin: string) => {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id != null && safeOrigin(tab.url) === pageOrigin)
      .map((tab) =>
        browser.tabs
          .sendMessage(tab.id!, {
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

// Whether the origin's marker still resolves to a session the worker can send with; refreshes a stale one on the way.
const sessionState = async (
  data: { apiUrl?: string; projectKey?: string },
  pageOrigin?: string
): Promise<boolean> => {
  if (!pageOrigin) {
    return false;
  }
  const marker = await loadOAuthMarker(pageOrigin);
  if (
    !marker?.projectKey ||
    !sameOrigin(marker.apiUrl, data.apiUrl) ||
    (data.projectKey !== undefined && marker.projectKey !== data.projectKey)
  ) {
    return false;
  }
  const session = await resolveSessionForTab({
    apiUrl: marker.apiUrl,
    projectKey: marker.projectKey,
  });
  if (!session) {
    return false;
  }
  return Boolean(await ensureFreshToken(session));
};

const injectCredentials = async (
  tabId: number,
  data: {
    apiUrl: string;
    oauth: true;
    projectId?: number;
    projectKey: string;
    pageOrigin: string;
  }
) => {
  await browser.tabs
    .sendMessage(tabId, { type: 'SET_CREDENTIALS', data })
    .catch(() => undefined);
};
