import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const removed: string[] = [];
let getDelayMs = 0;

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: async (key: string) => {
          if (getDelayMs) {
            await new Promise((r) => setTimeout(r, getDelayMs));
          }
          return store.has(key) ? { [key]: store.get(key) } : {};
        },
        set: async (obj: Record<string, unknown>) => {
          Object.entries(obj).forEach(([k, v]) => store.set(k, v));
        },
        remove: async (key: string) => {
          removed.push(key);
          store.delete(key);
        },
      },
    },
  },
}));

import {
  clearAllTabs,
  dropTabIfNavigatedAway,
  loadTabEntries,
  registerTab,
  unregisterTab,
  unregisterTabsForOrigin,
} from './tabRegistry';

const ORIGIN_A = 'https://a.example';
const ORIGIN_B = 'https://b.example';

describe('tabRegistry', () => {
  beforeEach(() => {
    store.clear();
    removed.length = 0;
    getDelayMs = 0;
  });

  it('registers a tab and it shows up in loadTabEntries', async () => {
    await registerTab(1, {
      apiUrl: 'https://app.tolgee.io',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });

    const entries = await loadTabEntries();
    expect(entries).toEqual([
      [
        '1',
        {
          apiUrl: 'https://app.tolgee.io',
          pageOrigin: ORIGIN_A,
          projectKey: '5',
        },
      ],
    ]);
  });

  it('unregisterTab drops exactly that tab', async () => {
    await registerTab(1, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });
    await registerTab(2, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });

    await unregisterTab(1);

    const ids = (await loadTabEntries()).map(([id]) => id);
    expect(ids).toEqual(['2']);
  });

  it('unregisterTab on a tab that was never registered is a no-op', async () => {
    await registerTab(1, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });

    await unregisterTab(999);

    expect((await loadTabEntries()).length).toBe(1);
  });

  it('unregisterTabsForOrigin drops every tab on that origin, keeps others', async () => {
    await registerTab(1, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });
    await registerTab(2, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });
    await registerTab(3, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_B,
      projectKey: '7',
    });

    await unregisterTabsForOrigin(ORIGIN_A);

    const ids = (await loadTabEntries()).map(([id]) => id);
    expect(ids).toEqual(['3']);
  });

  it('dropTabIfNavigatedAway drops a tab that navigated to a different origin', async () => {
    await registerTab(1, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });

    await dropTabIfNavigatedAway(1, `${ORIGIN_B}/page`);

    expect(await loadTabEntries()).toEqual([]);
  });

  it('dropTabIfNavigatedAway keeps a tab that reloaded on the same origin', async () => {
    await registerTab(1, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });

    await dropTabIfNavigatedAway(1, `${ORIGIN_A}/other-page`);

    expect((await loadTabEntries()).length).toBe(1);
  });

  it('clearAllTabs wipes the whole registry (browser restart: tab ids are reissued)', async () => {
    await registerTab(1, {
      apiUrl: 'x',
      pageOrigin: ORIGIN_A,
      projectKey: '5',
    });

    await clearAllTabs();

    expect(await loadTabEntries()).toEqual([]);
  });

  it('serializes concurrent registrations so neither write clobbers the other', async () => {
    // Both reads race against the same initial (empty) storage.local.get before either write lands.
    getDelayMs = 5;
    await Promise.all([
      registerTab(1, { apiUrl: 'x', pageOrigin: ORIGIN_A, projectKey: '5' }),
      registerTab(2, { apiUrl: 'x', pageOrigin: ORIGIN_A, projectKey: '7' }),
    ]);

    const ids = (await loadTabEntries()).map(([id]) => id).sort();
    expect(ids).toEqual(['1', '2']);
  });
});
