import browser from 'webextension-polyfill';
import { getActiveTab } from './activeTab';

export const sendMessage = async (type: string, data?: any) => {
  const tab = await getActiveTab();
  if (tab?.id == null) {
    throw new Error('No active tab to message');
  }
  const response = await browser.tabs.sendMessage(tab.id, { type, data });

  if (browser.runtime.lastError) {
    throw browser.runtime.lastError;
  }

  return response;
};
