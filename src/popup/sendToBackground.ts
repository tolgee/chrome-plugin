import browser from 'webextension-polyfill';

export const sendToBackground = async (type: string, data?: any) => {
  return browser.runtime.sendMessage({ type, data });
};
