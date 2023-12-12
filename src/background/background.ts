import { ScreenshotMaker } from './ScreenshotMaker';

type State = 'present' | 'active' | 'inactive';

chrome.runtime.onMessage.addListener(({ type, data }, sender, sendResponse) => {
  switch (type) {
    case 'TOLGEE_TAKE_SCREENSHOT':
      ScreenshotMaker.capture(sender.tab!.windowId).then((data) => {
        sendResponse(data);
      });
      // this indicates, that we send response asynchronously
      return true;
    case 'TOLGEE_SET_STATE':
      setStateIcon(data, sender.tab!.id!);
      return false;
    default:
      return false;
  }
});

const setStateIcon = (state: State, tabId: number) => {
  chrome.browserAction.setIcon({
    path: {
      128: `assets/${state}.png`,
    },
    tabId,
  });
};
