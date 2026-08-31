import browser from 'webextension-polyfill';

export const getActiveTab = async () =>
  (await browser.tabs.query({ active: true, currentWindow: true }))[0];
