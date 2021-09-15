export class ScreenshotMaker {
  static capture = async () => {
    return new Promise((resolve) => {
      chrome.tabs.captureVisibleTab((data) => {
        resolve(data);
      });
    });
  };
}
