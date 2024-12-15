import browser from 'webextension-polyfill';

export class ScreenshotMaker {
  static capture = (tabId: number) => {
    return browser.tabs.captureVisibleTab(tabId);
  };
}
