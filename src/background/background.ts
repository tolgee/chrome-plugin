import { ScreenshotMaker } from './ScreenshotMaker';

chrome.runtime.onMessage.addListener((_request, sender, sendResponse) => {
  ScreenshotMaker.capture(sender.tab.windowId).then((data) => {
    sendResponse(data);
  });
  // this indicates, that we send response asynchronously
  return true;
});
