export class ScreenshotMaker {
  static capture = async (tabId: number) => {
    return new Promise((resolve) => {
      chrome.tabs.captureVisibleTab(tabId, (data) => {
        resolve(data);
      });
    });
  };
}
