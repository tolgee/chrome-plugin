import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  AUTH_TOKEN_SESSION_STORAGE,
  BRANCH_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../constants';
import { shouldAcceptTokenPush } from './shouldAcceptTokenPush';

export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const writeCredentialsIfChanged = (
  store: SessionStore,
  data: {
    apiKey?: string | null;
    apiUrl?: string | null;
    branch?: string | null;
    authToken?: string | null;
    projectId?: string | number | null;
    projectKey?: string | null;
  }
): boolean =>
  [
    setOrRemove(store, API_KEY_SESSION_STORAGE, data.apiKey),
    setOrRemove(store, API_URL_SESSION_STORAGE, data.apiUrl),
    setOrRemove(store, BRANCH_SESSION_STORAGE, data.branch),
    setOrRemove(store, AUTH_TOKEN_SESSION_STORAGE, data.authToken),
    setOrRemove(store, PROJECT_ID_SESSION_STORAGE, data.projectId),
    setOrRemove(store, PROJECT_KEY_SESSION_STORAGE, data.projectKey),
  ].some(Boolean);

// A push meant for another keyed session on the same origin is dropped, not stored.
export const acceptTokenPush = (
  store: SessionStore,
  data: { authToken: string; projectKey?: string; apiUrl?: string }
): boolean => {
  const accept = shouldAcceptTokenPush({
    authToken: data.authToken,
    projectKey: data.projectKey,
    pageProjectKey: store.getItem(PROJECT_KEY_SESSION_STORAGE),
    pageApiUrl: store.getItem(API_URL_SESSION_STORAGE),
    pushApiUrl: data.apiUrl,
  });
  if (accept) {
    store.setItem(AUTH_TOKEN_SESSION_STORAGE, data.authToken);
  }
  return accept;
};

const setOrRemove = (
  store: SessionStore,
  key: string,
  value: string | number | undefined | null
): boolean => {
  const next = value ? String(value) : null;
  if (store.getItem(key) === next) {
    return false;
  }
  if (next === null) {
    store.removeItem(key);
  } else {
    store.setItem(key, next);
  }
  return true;
};
