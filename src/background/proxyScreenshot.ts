import browser from 'webextension-polyfill';
import { ScreenshotMaker } from './ScreenshotMaker';
import { isWebPageSender, MessageSender } from './sender';
import {
  locateSession,
  performWithRefresh,
  refreshGate,
} from './proxyCredential';
import { PROXY_BUDGET_MS } from '../protocol';
import { failure, ProxyResult, ScreenshotUploadData } from './proxyTypes';

export const handleScreenshotUpload = async (
  data: ScreenshotUploadData,
  sender: MessageSender
): Promise<ProxyResult & { width?: number; height?: number }> => {
  const deadline = Date.now() + PROXY_BUDGET_MS;
  if (!isWebPageSender(sender) || sender.tab.windowId === undefined) {
    return failure('not_allowed', 'screenshots can only be taken from a tab');
  }
  // captureVisibleTab captures whatever tab is in front of that window, not the sender: a connected origin in a
  // background tab could otherwise upload, and be handed the URL of, a screenshot of any other site.
  if (!(await isActiveTab(sender.tab.id))) {
    return notActiveTab();
  }
  const located = await locateSession(data, sender);
  if ('error' in located) {
    return located;
  }
  const gate = await refreshGate(located);
  if ('error' in gate) {
    return gate;
  }
  // Checked again here: the refresh above can take seconds, long enough for the user to switch tabs.
  if (!(await isActiveTab(sender.tab.id))) {
    return notActiveTab();
  }
  let captured: CapturedImage;
  try {
    captured = await captureImage(sender.tab.windowId);
  } catch (e) {
    return failure('unavailable', `screenshot capture failed: ${String(e)}`);
  }
  notifyCaptured(sender, data.id);
  const body = new FormData();
  body.append('image', captured.image);
  const result = await performWithRefresh(
    gate,
    '/v2/image-upload',
    { method: 'POST', headers: {}, body },
    deadline
  );
  return 'response' in result ? { ...result, ...captured.size } : result;
};

const notActiveTab = () =>
  failure('not_allowed', 'screenshots can only be taken from the active tab');

export const isActiveTab = async (
  tabId: number | undefined
): Promise<boolean> =>
  tabId === undefined
    ? false
    : Boolean((await browser.tabs.get(tabId).catch(() => undefined))?.active);

type CapturedImage = { image: Blob; size: { width: number; height: number } };

const captureImage = async (windowId: number): Promise<CapturedImage> => {
  const dataUrl = await ScreenshotMaker.capture(windowId);
  const image = await fetch(dataUrl).then((r) => r.blob());
  const bitmap = await createImageBitmap(image);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { image, size };
};

// Fire-and-forget: awaiting it would stall the upload behind the content script's always-open message channel.
const notifyCaptured = (
  sender: MessageSender & { tab: { id?: number } },
  id: string | undefined
) => {
  browser.tabs
    .sendMessage(
      sender.tab.id!,
      { type: 'TOLGEE_SCREENSHOT_CAPTURED', data: { id } },
      { frameId: sender.frameId }
    )
    .catch(() => undefined);
};
