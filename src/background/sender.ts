import browser from 'webextension-polyfill';
import { safeOrigin } from '../oauth/url';

export type MessageSender = {
  url?: string;
  frameId?: number;
  tab?: { id?: number; url?: string; windowId?: number };
};

// A tab can only ever act for its own origin; a claimed pageOrigin is honoured solely for the extension's own pages
// (the popup). Those are told apart by their URL, not by a missing sender.tab: the action popup has none, but the
// same page opened in a tab does.
export const requesterOrigin = (
  sender: MessageSender,
  claimed?: string
): string | undefined =>
  isTabSender(sender) ? safeOrigin(sender.tab.url) : claimed;

export const isTabSender = (
  sender: MessageSender
): sender is MessageSender & { tab: { url?: string } } =>
  Boolean(sender.tab) && !isExtensionPage(sender.url);

export const isExtensionPage = (url?: string): boolean =>
  Boolean(url?.startsWith(browser.runtime.getURL('')));
