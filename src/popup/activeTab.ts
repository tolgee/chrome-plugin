import browser from 'webextension-polyfill';

// Opened as a plain tab (end-to-end tests), the popup is itself the active tab, so the tab it should act on is
// passed in the URL instead.
const tabIdFromUrl = () => {
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
