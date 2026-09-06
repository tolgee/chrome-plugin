import browser from 'webextension-polyfill';
import { connectRefusalOf } from '../oauth/connectRefusal';
import {
  clearConnectRefusal,
  storeConnectRefusal,
} from '../oauth/connectRefusalStore';
import { safeOrigin, sameOrigin } from '../oauth/url';
import { projectKeyFor } from '../oauth/sessionRules';
import {
  clearConnection,
  isOAuthConnection,
  loadConnectionForTeardown,
  loadOriginRecord,
  storeOAuthConnection,
} from '../oauth/connection';
import { PageCredentials } from '../types';
import { supportsProxy } from '../protocol';
import { deliverToOrigin } from '../tabCredentials';
import { openPopup } from './popupControl';
import { acquireSession, endSessionIfUnreferenced } from './sessionLifecycle';

export const connect = async (data: {
  apiUrl: string;
  projectId: number | undefined;
  tabId?: number;
  protocolVersion?: number;
}): Promise<void> => {
  if (!supportsProxy(data.protocolVersion)) {
    throw new Error('Tolgee: signing in needs a newer @tolgee/web on the page');
  }
  if (data.projectId === undefined) {
    throw new Error('Tolgee: cannot connect without a project id');
  }
  const projectId = data.projectId;

  const requestingOrigin = await tabOrigin(data.tabId);
  if (data.tabId == null || !requestingOrigin) {
    throw new Error('Tolgee: cannot connect without a page to connect');
  }
  await clearConnectRefusal(requestingOrigin);
  try {
    await acquireSession(data.apiUrl, projectId);
  } catch (e) {
    await rememberRefusal(e, requestingOrigin, data.tabId);
    throw e;
  }

  if ((await tabOrigin(data.tabId)) !== requestingOrigin) {
    await endSessionIfUnreferenced(data.apiUrl, projectKeyFor(projectId));
    throw new Error(
      'Tolgee: the page navigated away during sign-in, please try again'
    );
  }

  await reassignOriginConnection(requestingOrigin, data.apiUrl, projectId);
  await injectCredentials(data.tabId, {
    apiUrl: data.apiUrl,
    session: 'oauth',
    projectId,
    projectKey: projectKeyFor(projectId),
    pageOrigin: requestingOrigin,
  });
};

// See oauth/connectRefusalStore.ts.
const rememberRefusal = async (
  e: unknown,
  origin: string | undefined,
  tabId: number | undefined
) => {
  const refusal = connectRefusalOf(e);
  if (!refusal || !origin) {
    return;
  }
  await storeConnectRefusal(origin, refusal);
  await openPopup(tabId).catch(() => undefined);
};

const tabOrigin = async (tabId?: number): Promise<string | undefined> =>
  tabId == null
    ? undefined
    : safeOrigin((await browser.tabs.get(tabId).catch(() => undefined))?.url);

const reassignOriginConnection = async (
  pageOrigin: string,
  apiUrl: string,
  projectId: number
) => {
  const projectKey = projectKeyFor(projectId);
  const previous = await loadOriginRecord(pageOrigin);
  const previousConnection = isOAuthConnection(previous)
    ? { apiUrl: previous.apiUrl, projectKey: previous.projectKey }
    : null;
  // A key the site ships in its own code stays remembered across a sign-in, so signing out can hand it back.
  await storeOAuthConnection(pageOrigin, {
    apiUrl,
    projectId,
    projectKey,
    siteKey: previous?.siteKey,
  });
  if (
    previousConnection?.projectKey &&
    !(
      sameOrigin(previousConnection.apiUrl, apiUrl) &&
      previousConnection.projectKey === projectKey
    )
  ) {
    await endSessionIfUnreferenced(
      previousConnection.apiUrl,
      previousConnection.projectKey
    );
  }
};

const injectCredentials = async (
  tabId: number,
  data: PageCredentials & { pageOrigin: string }
) => {
  await browser.tabs
    .sendMessage(tabId, {
      type: 'SET_CREDENTIALS',
      data: { ...data, editing: 'clear' },
    })
    .catch(() => undefined);
};

export const disconnect = async (data: { pageOrigin?: string }) => {
  if (!data.pageOrigin) {
    return;
  }
  const connection = await loadConnectionForTeardown(data.pageOrigin);
  // The origin's connection goes first: a tab reloads as soon as it is told to clear, and the popup re-applies whatever
  // OAUTH_SESSION_STATE still finds for the origin when the reloaded page handshakes.
  await clearConnection(data.pageOrigin);
  await deliverToOrigin(data.pageOrigin, { editing: 'clear' });
  if (connection?.projectKey) {
    await endSessionIfUnreferenced(connection.apiUrl, connection.projectKey);
  }
};
