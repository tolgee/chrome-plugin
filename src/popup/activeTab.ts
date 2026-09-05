import browser from 'webextension-polyfill';
import { safeOrigin } from '../oauth/url';

// Opened as a plain tab (end-to-end tests), the popup is itself the active tab, so the tab it should act on is
// passed in the URL instead.
const tabIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const id = new URLSearchParams(window.location.search).get('tabId');
  return id ? Number(id) : undefined;
};

export const getActiveTab = async () => {
  const forced = tabIdFromUrl();
  if (forced !== undefined) {
    return browser.tabs.get(forced);
  }
  return (await browser.tabs.query({ active: true, currentWindow: true }))[0];
};

export const getActiveTabOrigin = async (): Promise<string | undefined> =>
  safeOrigin((await getActiveTab())?.url);
