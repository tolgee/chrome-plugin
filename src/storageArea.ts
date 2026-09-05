import browser from 'webextension-polyfill';

// storage.session (Chrome 102+, Firefox 115+) dies with the browser, which is the right lifetime for what the worker
// only needs while the browser is open; storage.local stands in where it is missing.
export const sessionArea = () =>
  browser.storage.session ?? browser.storage.local;
