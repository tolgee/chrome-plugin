import browser from 'webextension-polyfill';
import { safeOrigin } from '../oauth/url';

const INJECTED_TABS_KEY = 'injectedTabs';

export type InjectedTab = {
  apiUrl: string;
  pageOrigin: string;
  projectKey: string;
};
type InjectedTabs = Record<string, InjectedTab>;

export const registerTab = (tabId: number, tab: InjectedTab): Promise<void> =>
  withRegistry(async (tabs) => {
    tabs[tabId] = tab;
    await saveInjectedTabs(tabs);
  });

export const unregisterTab = (tabId: number): Promise<void> =>
  withRegistry(async (tabs) => {
    if (tabs[tabId]) {
      await dropTab(tabs, tabId);
    }
  });

export const unregisterTabsForOrigin = (pageOrigin: string): Promise<void> =>
  withRegistry(async (tabs) => {
    const survivors = Object.entries(tabs).filter(
      ([, tab]) => tab.pageOrigin !== pageOrigin
    );
    if (survivors.length !== Object.keys(tabs).length) {
      await saveInjectedTabs(Object.fromEntries(survivors));
    }
  });

export const dropTabIfNavigatedAway = (
  tabId: number,
  newUrl: string | undefined
): Promise<void> =>
  withRegistry(async (tabs) => {
    const tab = tabs[tabId];
    if (tab && tab.pageOrigin !== safeOrigin(newUrl)) {
      await dropTab(tabs, tabId);
    }
  });

// Tab ids are reissued after a browser restart, so a persisted entry could misroute a token to an unrelated new tab.
export const clearAllTabs = (): Promise<void> =>
  browser.storage.local.remove(INJECTED_TABS_KEY);

export const loadTabEntries = async (): Promise<[string, InjectedTab][]> =>
  Object.entries(await loadInjectedTabs());

const dropTab = (tabs: InjectedTabs, tabId: number) => {
  delete tabs[tabId];
  return saveInjectedTabs(tabs);
};

const loadInjectedTabs = async (): Promise<InjectedTabs> =>
  ((await browser.storage.local.get(INJECTED_TABS_KEY))[
    INJECTED_TABS_KEY
  ] as InjectedTabs) ?? {};

const saveInjectedTabs = (tabs: InjectedTabs) =>
  browser.storage.local.set({ [INJECTED_TABS_KEY]: tabs });

// Serialize load→mutate→store so concurrent tab events can't read the same snapshot and clobber each other's write.
let registryQueue: Promise<unknown> = Promise.resolve();
const withRegistry = <T>(
  fn: (tabs: InjectedTabs) => Promise<T> | T
): Promise<T> => {
  const run = registryQueue.then(async () => fn(await loadInjectedTabs()));
  registryQueue = run.catch(() => undefined);
  return run;
};
