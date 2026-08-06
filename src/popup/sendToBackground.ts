import browser from 'webextension-polyfill';

// Messages the service worker (OAuth login/refresh/logout), unlike sendMessage which targets the page content script.
export const sendToBackground = async (type: string, data?: any) => {
  return browser.runtime.sendMessage({ type, data });
};
