import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  BRANCH_SESSION_STORAGE,
  OAUTH_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../constants';

export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const writeCredentialsIfChanged = (
  store: SessionStore,
  data: {
    apiKey?: string | null;
    apiUrl?: string | null;
    branch?: string | null;
    oauth?: boolean | null;
    projectId?: string | number | null;
    projectKey?: string | null;
  }
): boolean =>
  [
    setOrRemove(store, API_KEY_SESSION_STORAGE, data.apiKey),
    setOrRemove(store, API_URL_SESSION_STORAGE, data.apiUrl),
    setOrRemove(store, BRANCH_SESSION_STORAGE, data.branch),
    setOrRemove(store, OAUTH_SESSION_STORAGE, data.oauth ? '1' : null),
    setOrRemove(store, PROJECT_ID_SESSION_STORAGE, data.projectId),
    setOrRemove(store, PROJECT_KEY_SESSION_STORAGE, data.projectKey),
  ].some(Boolean);

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
