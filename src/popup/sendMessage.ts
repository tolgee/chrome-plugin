import browser from 'webextension-polyfill';

export const sendMessage = async (type: string, data?: any) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const response = await browser.tabs.sendMessage(tabs[0].id as number, {
    type,
    data,
  });

  if (browser.runtime.lastError) {
    throw browser.runtime.lastError;
  }

  return response;
};
