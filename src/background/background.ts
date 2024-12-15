import browser from 'webextension-polyfill';
import { ScreenshotMaker } from './ScreenshotMaker';
import { RuntimeMessage } from '../content/Messages';

type State = 'present' | 'active' | 'inactive';

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message as RuntimeMessage;
  switch (type) {
    case 'TOLGEE_TAKE_SCREENSHOT':
      ScreenshotMaker.capture(sender.tab!.windowId!).then((data) => {
        sendResponse(data);
      });
      return true;
    case 'TOLGEE_SET_STATE':
      setStateIcon(data, sender.tab!.id!);
      sendResponse({});
      break;
    default:
      sendResponse({});
  }
});

const setStateIcon = (state: State, tabId: number) => {
  browser.action.setIcon({
    path: { 128: `/icons/${state}.png` },
    tabId,
  });
};
