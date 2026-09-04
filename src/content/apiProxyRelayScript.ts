import browser from 'webextension-polyfill';
import { createApiProxyRelay } from './apiProxyRelay';

// Runs at document_start, separately from contentScript.ts (document_idle): window.postMessage has no queue and the
// SDK's first request leaves as soon as the in-context bundle loads, before DOMContentLoaded.
const relay = createApiProxyRelay(
  {
    origin: window.location.origin,
    getItem: (key) => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    sendToWorker: (message) => browser.runtime.sendMessage(message),
    postToPage: (message) => window.postMessage(message, window.origin),
  },
  window
);

window.addEventListener('message', (event) => relay.onPageMessage(event));
browser.runtime.onMessage.addListener((message) => {
  relay.onWorkerMessage(message);
  return undefined;
});
