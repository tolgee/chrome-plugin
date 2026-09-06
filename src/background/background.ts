import browser from 'webextension-polyfill';
import { ScreenshotMaker } from './ScreenshotMaker';
import {
  handleApiRequest,
  handlePopupApiRequest,
  ProxyFailure,
} from './apiProxy';
import { captureAndUploadScreenshot, isActiveTab } from './proxyScreenshot';
import { locateSession, authorizeSession } from './proxyCredential';
import {
  isCrossOriginFrame,
  isWebPageSender,
  MessageSender,
  requesterOrigin,
} from './sender';
import { RuntimeMessage } from '../content/Messages';
import { connectRefusalOf } from '../oauth/connectRefusal';
import { TOLGEE_API_REQUEST, TOLGEE_SCREENSHOT_UPLOAD } from '../protocol';
import { connect, disconnect } from './connectFlow';
import {
  openPopup,
  registerPopupControlListeners,
  setStateIcon,
} from './popupControl';

registerPopupControlListeners();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message as RuntimeMessage;
  switch (type) {
    case 'TOLGEE_TAKE_SCREENSHOT':
      captureActiveTab(sender).then((dataUrl) => {
        if (dataUrl !== undefined) {
          sendResponse(dataUrl);
        }
      });
      return true;
    case TOLGEE_API_REQUEST:
      handleApiRequest(data, sender)
        .catch((e) => proxyFailure(e, 'API proxy'))
        .then(sendResponse);
      return true;
    case 'TOLGEE_POPUP_API_REQUEST':
      handlePopupApiRequest(data, sender)
        .catch((e) => proxyFailure(e, 'popup API proxy'))
        .then(sendResponse);
      return true;
    case TOLGEE_SCREENSHOT_UPLOAD:
      captureAndUploadScreenshot(data, sender)
        .catch((e) => proxyFailure(e, 'screenshot proxy'))
        .then(sendResponse);
      return true;
    case 'TOLGEE_SET_STATE':
      setStateIcon(data, sender.tab!.id!);
      sendResponse({});
      break;
    case 'OPEN_POPUP':
      openPopup(isWebPageSender(sender) ? sender.tab.id : undefined);
      sendResponse({});
      break;
    case 'OAUTH_LOGIN':
      respondAsync(
        sendResponse,
        connect(data),
        'login',
        () => ({ connected: true }),
        (e) => connectRefusalOf(e) ?? {}
      );
      return true;
    case 'OAUTH_SESSION_STATE':
      respondAsync(
        sendResponse,
        refreshAndCheckSession(data, sender),
        'session refresh',
        (active) => ({ active }),
        () => ({ active: false })
      );
      return true;
    case 'OAUTH_LOGOUT':
      if (isCrossOriginFrame(sender)) {
        sendResponse({
          error:
            'only the page itself may end its session, not a cross-origin frame',
        });
        break;
      }
      respondAsync(
        sendResponse,
        disconnect({ pageOrigin: requesterOrigin(sender, data.pageOrigin) }),
        'logout',
        () => ({})
      );
      return true;
    default:
      sendResponse({});
  }
});

const proxyFailure = (e: unknown, label: string): ProxyFailure => {
  console.error(`[tolgee] ${label} failed`, e);
  return { error: { kind: 'unavailable', message: errorMessage(e) } };
};

const captureActiveTab = async (
  sender: MessageSender
): Promise<string | undefined> =>
  isWebPageSender(sender) &&
  !isCrossOriginFrame(sender) &&
  sender.tab.windowId !== undefined &&
  (await isActiveTab(sender.tab.id))
    ? ScreenshotMaker.capture(sender.tab.windowId)
    : undefined;

const respondAsync = <T>(
  sendResponse: (response: unknown) => void,
  work: Promise<T>,
  label: string,
  toSuccess: (value: T) => Record<string, unknown>,
  toError: (e: unknown) => Record<string, unknown> = () => ({})
) => {
  work
    .then((value) => sendResponse(toSuccess(value)))
    .catch((e) => {
      console.error(`[tolgee] ${label} failed`, e);
      sendResponse({ ...toError(e), error: errorMessage(e) });
    });
};

// The popup shows this text as-is; String(error) would prefix it with the error's class name.
const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const refreshAndCheckSession = async (
  data: { apiUrl?: string; projectKey?: string; pageOrigin?: string },
  sender: MessageSender
): Promise<boolean> => {
  const located = await locateSession(data, sender);
  if ('error' in located) {
    return false;
  }
  const authorized = await authorizeSession(located);
  return !('error' in authorized) || authorized.error.kind !== 'no_session';
};
