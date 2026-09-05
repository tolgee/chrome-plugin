import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  BRANCH_SESSION_STORAGE,
  EDITING_SESSION_STORAGE,
  EXTENSION_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../sessionStorageKeys';
import { SessionKind, sessionKindOf } from '../protocol';

export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PageCredentials = {
  // Only ever set for a page delivery (see CredentialDelivery); a proxied session leaves the slot cleared.
  apiKey?: string | null;
  apiUrl?: string | null;
  branch?: string | null;
  session?: SessionKind | null;
  projectId?: string | number | null;
  projectKey?: string | null;
  // 'off' writes the slot, null removes it, absent leaves it as it is (see popup/tools.ts pageEditing).
  editing?: 'off' | null;
};

export const writeCredentialsIfChanged = (
  store: SessionStore,
  data: PageCredentials
): boolean => {
  const changed = [
    setOrRemove(store, API_KEY_SESSION_STORAGE, data.apiKey),
    setOrRemove(store, API_URL_SESSION_STORAGE, data.apiUrl),
    setOrRemove(store, BRANCH_SESSION_STORAGE, data.branch),
    setOrRemove(store, EXTENSION_SESSION_STORAGE, data.session),
    setOrRemove(store, PROJECT_ID_SESSION_STORAGE, data.projectId),
    setOrRemove(store, PROJECT_KEY_SESSION_STORAGE, data.projectKey),
  ].some(Boolean);
  writeEditing(store, data.editing);
  return changed;
};

// The reader side of writeCredentialsIfChanged's slot list, kept in this file so the two can't drift apart.
export const readAppliedCredentials = (
  store: SessionStore
): PageCredentials => ({
  apiKey: store.getItem(API_KEY_SESSION_STORAGE),
  apiUrl: store.getItem(API_URL_SESSION_STORAGE),
  branch: store.getItem(BRANCH_SESSION_STORAGE),
  session: sessionKindOf(store.getItem(EXTENSION_SESSION_STORAGE)),
  projectId: store.getItem(PROJECT_ID_SESSION_STORAGE),
  projectKey: store.getItem(PROJECT_KEY_SESSION_STORAGE),
});

// Never part of the reload decision: the SDK reads the slot on every dialog request.
const writeEditing = (
  store: SessionStore,
  editing: 'off' | null | undefined
) => {
  if (editing === 'off') {
    store.setItem(EDITING_SESSION_STORAGE, editing);
  } else if (editing === null) {
    store.removeItem(EDITING_SESSION_STORAGE);
  }
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
