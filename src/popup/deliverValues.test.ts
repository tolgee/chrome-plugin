import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const sent: { tabId: number; message: any }[] = [];
const TABS = [
  { id: 1, url: 'https://site.example/page' },
  { id: 2, url: 'https://site.example/other' },
  { id: 3, url: 'https://other.example/page' },
];

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: async (q: { active?: boolean }) => (q.active ? [TABS[0]] : TABS),
      sendMessage: async (tabId: number, message: unknown) => {
        sent.push({ tabId, message });
      },
    },
    storage: {
      local: {
        get: async (key: string) =>
          store.has(key) ? { [key]: store.get(key) } : {},
        set: async (obj: Record<string, unknown>) =>
          Object.entries(obj).forEach(([k, v]) => store.set(k, v)),
        remove: async (key: string) => {
          store.delete(key);
        },
      },
    },
  },
}));

import { redeliverToPage, syncToStorageAndPage } from './deliverValues';

const ORIGIN = 'https://site.example';
const session = {
  apiUrl: 'https://app.tolgee.io',
  apiKey: 'tgpak_x',
  projectId: 7,
  projectKey: '7',
};
const sdk = {
  uiPresent: true,
  protocolVersion: 2,
  mode: 'production' as const,
};

describe('syncToStorageAndPage', () => {
  beforeEach(() => {
    store.clear();
    sent.length = 0;
  });

  it('writes the origin record and tells the tab the popup is on about the session', async () => {
    await syncToStorageAndPage(
      {
        storedValues: session,
        appliedValues: session,
        editingSwitchedOff: false,
      },
      { ...sdk, config: { apiUrl: session.apiUrl, apiKey: '' } }
    );

    expect(store.get(ORIGIN)).toMatchObject({ apiKey: 'tgpak_x' });
    expect(sent).toEqual([
      {
        tabId: 1,
        message: {
          type: 'SET_CREDENTIALS',
          data: {
            apiKey: undefined,
            apiUrl: session.apiUrl,
            branch: undefined,
            session: 'apiKey',
            projectId: 7,
            projectKey: '7',
            editing: 'clear',
            pageOrigin: ORIGIN,
          },
        },
      },
    ]);
  });

  // The other tabs of the origin may be editing with this very session: restoring it here says nothing about them.
  it('a stored session restored on this page touches no other tab of the origin', async () => {
    store.set(ORIGIN, session);

    await syncToStorageAndPage(
      { storedValues: session, appliedValues: null, editingSwitchedOff: false },
      { ...sdk, config: { apiUrl: session.apiUrl, apiKey: '' } }
    );

    expect(sent.map((s) => s.tabId)).toEqual([1]);
    expect(sent[0].message.data).toEqual({
      editing: undefined,
      pageOrigin: ORIGIN,
    });
  });

  // A sibling tab left holding the session would keep sending requests the worker no longer answers for.
  it('switching editing off reaches every tab of the origin and no other', async () => {
    store.set(ORIGIN, session);

    await syncToStorageAndPage(
      { storedValues: session, appliedValues: null, editingSwitchedOff: true },
      { ...sdk, config: { apiUrl: session.apiUrl, apiKey: '' } }
    );

    expect(sent.map((s) => s.tabId)).toEqual([1, 2]);
    for (const { message } of sent) {
      expect(message.data).toEqual({ editing: 'off', pageOrigin: ORIGIN });
    }
  });

  it('removing the session clears the record and every tab of the origin', async () => {
    store.set(ORIGIN, session);

    await syncToStorageAndPage(
      { storedValues: null, appliedValues: null, editingSwitchedOff: false },
      { ...sdk, config: { apiUrl: session.apiUrl, apiKey: '' } }
    );

    expect(store.has(ORIGIN)).toBe(false);
    expect(sent.map((s) => s.tabId)).toEqual([1, 2]);
    for (const { message } of sent) {
      expect(message.data).toEqual({ editing: 'clear', pageOrigin: ORIGIN });
    }
  });
});

describe('redeliverToPage', () => {
  beforeEach(() => {
    store.clear();
    sent.length = 0;
  });

  it('leaves the editing slot alone', async () => {
    await redeliverToPage(session, {
      ...sdk,
      config: { apiUrl: session.apiUrl, apiKey: '' },
    });

    expect(sent).toEqual([
      {
        tabId: 1,
        message: {
          type: 'SET_CREDENTIALS',
          data: {
            apiKey: undefined,
            apiUrl: session.apiUrl,
            branch: undefined,
            session: 'apiKey',
            projectId: 7,
            projectKey: '7',
            pageOrigin: ORIGIN,
          },
        },
      },
    ]);
    expect(sent[0].message.data).not.toHaveProperty('editing');
  });
});
