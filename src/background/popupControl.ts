import browser from 'webextension-polyfill';
import { sessionArea } from '../storageArea';

export type IconState = 'present' | 'active' | 'inactive';

const POPUP_WINDOW = { type: 'popup', width: 420, height: 640 } as const;

// Keyed by the requesting tab, so a page looping OPEN_POPUP cannot spawn more than one fallback window for itself.
const KEY_PREFIX = 'popupWindow:';
const FOCUS_KEY_PREFIX = 'popupFocus:';
// Bounds a page re-posting TOLGEE_OPEN_PLUGIN in a loop to one focus-steal per cooldown.
const FOCUS_COOLDOWN_MS = 2000;

const keyFor = (tabId: number) => `${KEY_PREFIX}${tabId}`;
const focusKeyFor = (tabId: number) => `${FOCUS_KEY_PREFIX}${tabId}`;

// Firefox only honours action.openPopup() inside a user-input handler, so from a runtime message it rejects, and
// older Chrome lacks the call: the same popup page then opens as a small window pointed at the requesting tab
// (the ?tabId= override in src/popup/activeTab.ts).
export const openPopup = async (tabId: number | undefined) => {
  if (await openActionPopup()) {
    return;
  }
  if (tabId === undefined) {
    return;
  }
  await openOrFocusPopupWindow(tabId);
};

const openOrFocusPopupWindow = async (tabId: number) => {
  if (!(await claimCooldown(tabId))) {
    return;
  }
  const existing = await rememberedWindow(tabId);
  if (existing !== undefined && (await windowStillOpen(existing))) {
    await browser.windows
      .update(existing, { focused: true })
      .catch(() => undefined);
    return;
  }
  const created = await browser.windows
    .create({
      url: browser.runtime.getURL(`index.html?tabId=${tabId}`),
      ...POPUP_WINDOW,
    })
    .catch(() => undefined);
  if (created?.id === undefined) {
    await forget(keyFor(tabId));
    return;
  }
  await sessionArea().set({ [keyFor(tabId)]: created.id });
};

const claimCooldown = async (tabId: number): Promise<boolean> => {
  const key = focusKeyFor(tabId);
  const last = (await sessionArea().get(key))[key];
  const now = Date.now();
  if (typeof last === 'number' && now - last < FOCUS_COOLDOWN_MS) {
    return false;
  }
  await sessionArea().set({ [key]: now });
  return true;
};

const rememberedWindow = async (tabId: number): Promise<number | undefined> => {
  const key = keyFor(tabId);
  const stored = (await sessionArea().get(key))[key];
  return typeof stored === 'number' ? stored : undefined;
};

const windowStillOpen = (windowId: number): Promise<boolean> =>
  browser.windows.get(windowId).then(
    () => true,
    () => false
  );

const openActionPopup = (): Promise<boolean> => {
  const action = browser.action as { openPopup?: () => Promise<void> };
  return action.openPopup
    ? action.openPopup().then(
        () => true,
        () => false
      )
    : Promise.resolve(false);
};

const forget = (key: string) =>
  sessionArea()
    .remove(key)
    .catch(() => undefined);

export const registerPopupControlListeners = () => {
  browser.tabs.onRemoved.addListener((tabId) => {
    forget(keyFor(tabId));
    forget(focusKeyFor(tabId));
  });

  browser.windows.onRemoved.addListener(async (windowId) => {
    const all = await sessionArea()
      .get(null)
      .catch(() => ({}));
    const closed = Object.entries(all).find(
      ([key, value]) => key.startsWith(KEY_PREFIX) && value === windowId
    );
    if (closed) {
      await forget(closed[0]);
    }
  });
};

export const setStateIcon = (state: IconState, tabId: number) => {
  browser.action.setIcon({
    path: { 128: `/icons/${state}.png` },
    tabId,
  });
};
