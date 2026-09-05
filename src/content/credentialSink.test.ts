import { describe, expect, it } from 'vitest';
import { writeCredentialsIfChanged, SessionStore } from './credentialSink';
import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  EDITING_SESSION_STORAGE,
  EXTENSION_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../sessionStorageKeys';

const fakeStore = (
  init: Record<string, string> = {}
): SessionStore & { map: Map<string, string> } => {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
};

describe('writeCredentialsIfChanged', () => {
  it('maps each field to its session-storage key, the session kind included, and reports a change', () => {
    const store = fakeStore();
    const changed = writeCredentialsIfChanged(store, {
      apiUrl: 'https://app.tolgee.io',
      session: 'oauth',
      projectId: 7,
      projectKey: '5',
    });
    expect(changed).toBe(true);
    expect(store.map.get(API_URL_SESSION_STORAGE)).toBe(
      'https://app.tolgee.io'
    );
    expect(store.map.get(EXTENSION_SESSION_STORAGE)).toBe('oauth');
    expect(store.map.get(PROJECT_ID_SESSION_STORAGE)).toBe('7');
    expect(store.map.get(PROJECT_KEY_SESSION_STORAGE)).toBe('5');
    expect([...store.map.keys()]).not.toContain('__tolgee_authToken');
  });

  it('marks a proxied api-key session by kind only: the key itself never enters the page', () => {
    const store = fakeStore();
    writeCredentialsIfChanged(store, {
      apiUrl: 'https://app.tolgee.io',
      session: 'apiKey',
      projectId: 7,
      projectKey: '7',
    });
    expect(store.map.get(EXTENSION_SESSION_STORAGE)).toBe('apiKey');
    expect(store.map.has(API_KEY_SESSION_STORAGE)).toBe(false);
  });

  it('reports no change when the delivered values already match (no needless reload)', () => {
    const store = fakeStore({
      [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
      [EXTENSION_SESSION_STORAGE]: 'oauth',
    });
    expect(
      writeCredentialsIfChanged(store, {
        apiUrl: 'https://app.tolgee.io',
        session: 'oauth',
      })
    ).toBe(false);
  });

  it('hands the key to the page for a page delivery, with no session kind (the page uses the key itself)', () => {
    const store = fakeStore();
    const changed = writeCredentialsIfChanged(store, {
      apiKey: 'tgpak_x',
      apiUrl: 'https://app.tolgee.io',
      branch: 'feat',
      projectId: 7,
      projectKey: '7',
    });
    expect(changed).toBe(true);
    expect(store.map.get(API_KEY_SESSION_STORAGE)).toBe('tgpak_x');
    expect(store.map.get(API_URL_SESSION_STORAGE)).toBe(
      'https://app.tolgee.io'
    );
    expect(store.map.get(PROJECT_ID_SESSION_STORAGE)).toBe('7');
    expect(store.map.has(EXTENSION_SESSION_STORAGE)).toBe(false);
  });

  it('removes a key an older extension build left in the page on a proxied delivery', () => {
    const store = fakeStore({ [API_KEY_SESSION_STORAGE]: 'tgpak_x' });
    const changed = writeCredentialsIfChanged(store, {
      apiUrl: 'https://app.tolgee.io',
      session: 'apiKey',
    });
    expect(changed).toBe(true);
    expect(store.map.has(API_KEY_SESSION_STORAGE)).toBe(false);
    expect(store.map.get(EXTENSION_SESSION_STORAGE)).toBe('apiKey');
  });

  it('clears a page-delivered key on removal and on a switch to a proxied session', () => {
    const store = fakeStore({
      [API_KEY_SESSION_STORAGE]: 'tgpak_x',
      [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
    });
    expect(
      writeCredentialsIfChanged(store, {
        apiUrl: 'https://app.tolgee.io',
        session: 'oauth',
      })
    ).toBe(true);
    expect(store.map.has(API_KEY_SESSION_STORAGE)).toBe(false);

    store.map.set(API_KEY_SESSION_STORAGE, 'tgpak_x');
    expect(writeCredentialsIfChanged(store, {})).toBe(true);
    expect(store.map.size).toBe(0);
  });

  it('removes the session kind when the delivery carries none (sign out), and replaces it on a switch', () => {
    const store = fakeStore({
      [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
      [EXTENSION_SESSION_STORAGE]: 'oauth',
    });
    expect(
      writeCredentialsIfChanged(store, {
        apiUrl: 'https://app.tolgee.io',
        session: 'apiKey',
      })
    ).toBe(true);
    expect(store.map.get(EXTENSION_SESSION_STORAGE)).toBe('apiKey');

    expect(writeCredentialsIfChanged(store, {})).toBe(true);
    expect(store.map.size).toBe(0);
  });

  describe('the editing slot', () => {
    it("writes 'off', removes it on null and leaves it alone when the delivery says nothing about it", () => {
      const store = fakeStore();
      writeCredentialsIfChanged(store, { editing: 'off' });
      expect(store.map.get(EDITING_SESSION_STORAGE)).toBe('off');

      writeCredentialsIfChanged(store, {});
      expect(store.map.get(EDITING_SESSION_STORAGE)).toBe('off');

      writeCredentialsIfChanged(store, { editing: null });
      expect(store.map.has(EDITING_SESSION_STORAGE)).toBe(false);

      writeCredentialsIfChanged(store, {});
      expect(store.map.has(EDITING_SESSION_STORAGE)).toBe(false);
    });

    it('is written together with the credentials being cleared (editing off) and cleared with a fresh apply', () => {
      const store = fakeStore({
        [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
        [EXTENSION_SESSION_STORAGE]: 'apiKey',
      });
      expect(writeCredentialsIfChanged(store, { editing: 'off' })).toBe(true);
      expect([...store.map.entries()]).toEqual([
        [EDITING_SESSION_STORAGE, 'off'],
      ]);

      expect(
        writeCredentialsIfChanged(store, {
          apiUrl: 'https://app.tolgee.io',
          session: 'apiKey',
          editing: null,
        })
      ).toBe(true);
      expect(store.map.has(EDITING_SESSION_STORAGE)).toBe(false);
      expect(store.map.get(EXTENSION_SESSION_STORAGE)).toBe('apiKey');
    });

    it('never counts as a change on its own: the page is not reloaded for it', () => {
      const store = fakeStore();
      expect(writeCredentialsIfChanged(store, { editing: 'off' })).toBe(false);
      expect(writeCredentialsIfChanged(store, { editing: null })).toBe(false);
    });
  });
});
