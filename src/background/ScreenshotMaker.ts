import browser from 'webextension-polyfill';

export class ScreenshotMaker {
  static capture = (windowId: number) => {
    return browser.tabs.captureVisibleTab(windowId);
  };
}
