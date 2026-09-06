import browser from 'webextension-polyfill';
import { safeOrigin, sameOrigin } from '../oauth/url';

export type MessageSender = {
  url?: string;
  frameId?: number;
  tab?: { id?: number; url?: string; windowId?: number };
};

export const requesterOrigin = (
  sender: MessageSender,
  claimed?: string
): string | undefined =>
  isWebPageSender(sender) ? safeOrigin(sender.tab.url) : claimed;

// An extension page opened in a tab has a sender.tab too, so the URL check is what tells it from a web page.
export const isWebPageSender = (
  sender: MessageSender
): sender is MessageSender & { tab: { url?: string } } =>
  Boolean(sender.tab) && !isExtensionPage(sender.url);

export const isExtensionPage = (url?: string): boolean =>
  Boolean(url?.startsWith(browser.runtime.getURL('')));

// Same-origin frames may act for their page; a cross-origin iframe inside a connected tab may not.
export const isCrossOriginFrame = (sender: MessageSender): boolean =>
  isWebPageSender(sender) && !sameOrigin(sender.url, sender.tab.url);
