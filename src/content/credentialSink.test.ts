import { describe, expect, it } from 'vitest';
import { writeCredentialsIfChanged, SessionStore } from './credentialSink';
import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  OAUTH_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../constants';

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
  it('maps each field to its session-storage key, the signed-in flag as "1", and reports a change', () => {
    const store = fakeStore();
    const changed = writeCredentialsIfChanged(store, {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 7,
      projectKey: '5',
    });
    expect(changed).toBe(true);
    expect(store.map.get(API_URL_SESSION_STORAGE)).toBe(
      'https://app.tolgee.io'
    );
    expect(store.map.get(OAUTH_SESSION_STORAGE)).toBe('1');
    expect(store.map.get(PROJECT_ID_SESSION_STORAGE)).toBe('7');
    expect(store.map.get(PROJECT_KEY_SESSION_STORAGE)).toBe('5');
    expect([...store.map.keys()]).not.toContain('__tolgee_authToken');
  });

  it('reports no change when the delivered values already match (no needless reload)', () => {
    const store = fakeStore({
      [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
      [OAUTH_SESSION_STORAGE]: '1',
    });
    expect(
      writeCredentialsIfChanged(store, {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
      })
    ).toBe(false);
  });

  it('removes a key whose value is now absent', () => {
    const store = fakeStore({ [API_KEY_SESSION_STORAGE]: 'tgpak_x' });
    const changed = writeCredentialsIfChanged(store, {
      apiUrl: 'https://app.tolgee.io',
    });
    expect(changed).toBe(true);
    expect(store.map.has(API_KEY_SESSION_STORAGE)).toBe(false);
  });

  it('removes the signed-in flag when the delivery carries none (sign out, or an api key applied instead)', () => {
    const store = fakeStore({
      [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
      [OAUTH_SESSION_STORAGE]: '1',
    });
    expect(
      writeCredentialsIfChanged(store, {
        apiUrl: 'https://app.tolgee.io',
        apiKey: 'tgpak_x',
      })
    ).toBe(true);
    expect(store.map.has(OAUTH_SESSION_STORAGE)).toBe(false);
    expect(store.map.get(API_KEY_SESSION_STORAGE)).toBe('tgpak_x');

    expect(writeCredentialsIfChanged(store, {})).toBe(true);
    expect(store.map.size).toBe(0);
  });
});
