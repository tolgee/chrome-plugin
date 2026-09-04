export const API_KEY_SESSION_STORAGE = '__tolgee_apiKey';
export const API_URL_SESSION_STORAGE = '__tolgee_apiUrl';
export const BRANCH_SESSION_STORAGE = '__tolgee_branch';
// '1' on a page signed in through the extension; the SDK then sends its requests through the extension.
export const OAUTH_SESSION_STORAGE = '__tolgee_oauth';
// See oauth/sessionRules.ts for the projectId-vs-projectKey distinction these two slots carry.
export const PROJECT_ID_SESSION_STORAGE = '__tolgee_projectId';
export const PROJECT_KEY_SESSION_STORAGE = '__tolgee_projectKey';

export const POPUP_WIDTH = 400;

// Page <-> extension wire protocol. 2 = the SDK sends its Tolgee API requests through the extension (no token in
// the page); the SDK reports the version it speaks in TOLGEE_READY, the content script in TOLGEE_PONG.
export const PROTOCOL_VERSION = 2;
// Display only (the gate keys off PROTOCOL_VERSION): the first @tolgee/web release that speaks protocol 2.
export const MIN_SDK_VERSION_FOR_OAUTH = '7.2.0';

// Public client id pre-registered on every Tolgee backend (see PreRegisteredClients on the platform).
export const OAUTH_CLIENT_ID = 'tolgee-browser-extension';

export const OAUTH_REFRESH_SKEW_MS = 60_000;
export const OAUTH_REQUEST_TIMEOUT_MS = 15_000;
export const OAUTH_SCOPES = [
  'translations.view',
  'translations.edit',
  'translations.state-edit',
  'keys.view',
  'keys.create',
  'keys.edit',
  'screenshots.view',
  'screenshots.upload',
  'screenshots.delete',
].join(' ');
