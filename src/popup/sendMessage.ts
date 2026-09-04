import browser from 'webextension-polyfill';
import { getActiveTab } from './activeTab';

export const sendMessage = async (type: string, data?: any) => {
  const tab = await getActiveTab();
  if (tab?.id == null) {
    throw new Error('No active tab to message');
  }
  return browser.tabs.sendMessage(tab.id, { type, data });
};
