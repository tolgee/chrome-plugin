import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = new Map<string, unknown>();
const { windowsCreate, windowsGet, windowsUpdate, openPopup } = vi.hoisted(
  () => ({
    windowsCreate: vi.fn(async () => ({ id: 99 })),
    windowsGet: vi.fn(async () => ({ id: 99 })),
    windowsUpdate: vi.fn(async () => undefined),
    openPopup: vi.fn(async () => {
      throw new Error('no user gesture');
    }),
  })
);
const listeners: {
  tabRemoved?: (tabId: number) => void;
  windowRemoved?: (windowId: number) => void;
} = {};

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    action: { openPopup, setIcon: vi.fn() },
    tabs: {
      onRemoved: {
        addListener: (fn: (tabId: number) => void) => {
          listeners.tabRemoved = fn;
        },
      },
    },
    windows: {
      create: windowsCreate,
      get: windowsGet,
      update: windowsUpdate,
      onRemoved: {
        addListener: (fn: (windowId: number) => void) => {
          listeners.windowRemoved = fn;
        },
      },
    },
    storage: {
      session: {
        get: async (key: string | null) =>
          key === null
            ? Object.fromEntries(session)
            : session.has(key)
              ? { [key]: session.get(key) }
              : {},
        set: async (obj: Record<string, unknown>) =>
          Object.entries(obj).forEach(([k, v]) => session.set(k, v)),
        remove: async (key: string) => {
          session.delete(key);
        },
      },
    },
  },
}));

// The worker is terminated between two requests as a matter of course, so the module is re-imported to prove the
// dedupe survives it.
const loadPopupControl = async () => {
  vi.resetModules();
  const popupControl = await import('./popupControl');
  popupControl.registerPopupControlListeners();
  return popupControl.openPopup;
};

const COOLDOWN_MS = 2000;
const pastCooldown = () => vi.setSystemTime(Date.now() + COOLDOWN_MS + 1);

describe('fallback popup window', () => {
  beforeEach(() => {
    session.clear();
    windowsCreate.mockClear().mockResolvedValue({ id: 99 });
    windowsGet.mockClear().mockResolvedValue({ id: 99 });
    windowsUpdate.mockClear();
    openPopup.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('focuses the window a tab already has instead of opening a second one, after the worker was restarted', async () => {
    await (
      await loadPopupControl()
    )(7);
    pastCooldown();
    await (
      await loadPopupControl()
    )(7);

    expect(windowsCreate).toHaveBeenCalledOnce();
    expect(windowsUpdate).toHaveBeenCalledWith(99, { focused: true });
  });

  it('opens a fresh window once the tracked one is gone', async () => {
    await (
      await loadPopupControl()
    )(7);
    windowsGet.mockRejectedValue(new Error('no such window'));
    pastCooldown();
    await (
      await loadPopupControl()
    )(7);

    expect(windowsCreate).toHaveBeenCalledTimes(2);
  });

  it('gives every tab its own window', async () => {
    const open = await loadPopupControl();
    await open(7);
    windowsCreate.mockResolvedValue({ id: 100 });
    await open(8);

    expect(windowsCreate).toHaveBeenCalledTimes(2);
  });

  it('forgets the window when the tab or the window is gone', async () => {
    await (
      await loadPopupControl()
    )(7);
    expect(session.has('popupWindow:7')).toBe(true);

    listeners.windowRemoved?.(99);
    await vi.waitFor(() => expect(session.has('popupWindow:7')).toBe(false));

    pastCooldown();
    await (
      await loadPopupControl()
    )(7);
    listeners.tabRemoved?.(7);
    await vi.waitFor(() => expect(session.has('popupWindow:7')).toBe(false));
    expect(session.has('popupFocus:7')).toBe(false);
  });

  it('throttles repeated focus requests for the same tab within the cooldown', async () => {
    const open = await loadPopupControl();
    await open(7);
    await open(7);
    await open(7);

    expect(windowsCreate).toHaveBeenCalledOnce();
    expect(windowsUpdate).not.toHaveBeenCalled();
  });

  it('allows a further focus request once the cooldown has elapsed', async () => {
    const open = await loadPopupControl();
    await open(7);
    await open(7);
    pastCooldown();
    await open(7);

    expect(windowsCreate).toHaveBeenCalledOnce();
    expect(windowsUpdate).toHaveBeenCalledOnce();
  });
});
