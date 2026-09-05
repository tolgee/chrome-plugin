// The page slots the extension writes and the SDK reads. Mirror of tolgee-js
// packages/web/src/package/tools/sessionStorageKeys.ts: the two repos release independently, so every name here has
// to stay the one shipped SDKs look for.

// Reserved for the extension: the SDK stores nothing of its own under this prefix, and wipes the whole prefix when a
// handshake fails.
export const TOLGEE_SESSION_STORAGE_PREFIX = '__tolgee_';

export const API_KEY_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}apiKey`;
export const API_URL_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}apiUrl`;
export const BRANCH_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}branch`;
export const EXTENSION_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}session`;
// See oauth/sessionRules.ts for the projectId-vs-projectKey distinction these two slots carry.
export const PROJECT_ID_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}projectId`;
export const PROJECT_KEY_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}projectKey`;
// 'off' while the user has switched in-context editing off for the page: the SDK's dialog then says so instead of
// asking to sign in.
export const EDITING_SESSION_STORAGE = `${TOLGEE_SESSION_STORAGE_PREFIX}editing`;
