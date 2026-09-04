import { describe, expect, it } from 'vitest';
import {
  acceptTokenPush,
  writeCredentialsIfChanged,
  SessionStore,
} from './credentialSink';
import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  AUTH_TOKEN_SESSION_STORAGE,
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
  it('maps each field to its session-storage key and reports a change', () => {
    const store = fakeStore();
    const changed = writeCredentialsIfChanged(store, {
      apiUrl: 'https://app.tolgee.io',
      authToken: 'jwt',
      projectId: 7,
      projectKey: '5',
    });
    expect(changed).toBe(true);
    expect(store.map.get(API_URL_SESSION_STORAGE)).toBe(
      'https://app.tolgee.io'
    );
    expect(store.map.get(AUTH_TOKEN_SESSION_STORAGE)).toBe('jwt');
    expect(store.map.get(PROJECT_ID_SESSION_STORAGE)).toBe('7');
    expect(store.map.get(PROJECT_KEY_SESSION_STORAGE)).toBe('5');
  });

  it('reports no change when the delivered values already match (no needless reload)', () => {
    const store = fakeStore({
      [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
      [AUTH_TOKEN_SESSION_STORAGE]: 'jwt',
    });
    expect(
      writeCredentialsIfChanged(store, {
        apiUrl: 'https://app.tolgee.io',
        authToken: 'jwt',
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
});

describe('acceptTokenPush', () => {
  const page = {
    [PROJECT_KEY_SESSION_STORAGE]: '7',
    [API_URL_SESSION_STORAGE]: 'https://app.tolgee.io',
  };

  it('stores a token whose scope serves this page and backend', () => {
    const store = fakeStore(page);
    expect(
      acceptTokenPush(store, {
        authToken: 'new-jwt',
        projectKey: '7',
        apiUrl: 'https://app.tolgee.io',
      })
    ).toBe(true);
    expect(store.map.get(AUTH_TOKEN_SESSION_STORAGE)).toBe('new-jwt');
  });

  it('accepts a push keyed to the session even when the page displays a different operating project', () => {
    const store = fakeStore({
      ...page,
      [PROJECT_ID_SESSION_STORAGE]: '99',
    });
    expect(
      acceptTokenPush(store, {
        authToken: 'new-jwt',
        projectKey: '7',
        apiUrl: 'https://app.tolgee.io',
      })
    ).toBe(true);
  });

  it('drops a token scoped to a different project (per-project isolation)', () => {
    const store = fakeStore(page);
    expect(
      acceptTokenPush(store, {
        authToken: 'other-jwt',
        projectKey: '5',
        apiUrl: 'https://app.tolgee.io',
      })
    ).toBe(false);
    expect(store.map.has(AUTH_TOKEN_SESSION_STORAGE)).toBe(false);
  });

  it('drops a token pushed for a different backend', () => {
    const store = fakeStore(page);
    expect(
      acceptTokenPush(store, {
        authToken: 'new-jwt',
        projectKey: '7',
        apiUrl: 'https://other.tolgee.io',
      })
    ).toBe(false);
    expect(store.map.has(AUTH_TOKEN_SESSION_STORAGE)).toBe(false);
  });
});
