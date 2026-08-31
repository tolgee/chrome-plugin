import {
  API_KEY_LOCAL_STORAGE,
  API_URL_LOCAL_STORAGE,
  AUTH_TOKEN_LOCAL_STORAGE,
  BRANCH_LOCAL_STORAGE,
  PROJECT_ID_LOCAL_STORAGE,
} from '../constants';
import { shouldAcceptTokenPush } from './shouldAcceptTokenPush';

export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const writeCredentials = (
  store: SessionStore,
  data: {
    apiKey?: string | null;
    apiUrl?: string | null;
    branch?: string | null;
    authToken?: string | null;
    projectId?: string | number | null;
  }
): boolean =>
  [
    setOrRemove(store, API_KEY_LOCAL_STORAGE, data.apiKey),
    setOrRemove(store, API_URL_LOCAL_STORAGE, data.apiUrl),
    setOrRemove(store, BRANCH_LOCAL_STORAGE, data.branch),
    setOrRemove(store, AUTH_TOKEN_LOCAL_STORAGE, data.authToken),
    setOrRemove(store, PROJECT_ID_LOCAL_STORAGE, data.projectId),
  ].some(Boolean);

// A rotated token is stored only if it serves THIS page — its declared project and backend, read from session storage —
// so a push meant for another keyed session on the same origin is dropped.
export const acceptTokenPush = (
  store: SessionStore,
  data: { authToken: string; projectKey?: string; apiUrl?: string }
): boolean => {
  const accept = shouldAcceptTokenPush({
    authToken: data.authToken,
    projectKey: data.projectKey,
    pageProjectId: store.getItem(PROJECT_ID_LOCAL_STORAGE),
    pageApiUrl: store.getItem(API_URL_LOCAL_STORAGE),
    pushApiUrl: data.apiUrl,
  });
  if (accept) {
    store.setItem(AUTH_TOKEN_LOCAL_STORAGE, data.authToken);
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
