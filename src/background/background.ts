import { ScreenshotMaker } from './ScreenshotMaker';

chrome.runtime.onMessage.addListener((_request, _sender, sendResponse) => {
  ScreenshotMaker.capture().then((data) => {
    sendResponse(data);
  });
  // this indicates, that we send response asynchronously
  return true;
});
