export const API_KEY_SESSION_STORAGE = '__tolgee_apiKey';
export const API_URL_SESSION_STORAGE = '__tolgee_apiUrl';
export const BRANCH_SESSION_STORAGE = '__tolgee_branch';
export const AUTH_TOKEN_SESSION_STORAGE = '__tolgee_authToken';
// See oauth/sessionRules.ts for the projectId-vs-projectKey distinction these two slots carry.
export const PROJECT_ID_SESSION_STORAGE = '__tolgee_projectId';
export const PROJECT_KEY_SESSION_STORAGE = '__tolgee_projectKey';

export const POPUP_WIDTH = 400;

// Public client id pre-registered on every Tolgee backend (see PreRegisteredClients on the platform).
export const OAUTH_CLIENT_ID = 'tolgee-browser-extension';

export const REFRESH_ALARM_PERIOD_MINUTES = 5;
// The + 1 keeps a stale token inside the alarm's next tick, not past it (avoiding the 401 window).
export const OAUTH_REFRESH_SKEW_MS =
  (REFRESH_ALARM_PERIOD_MINUTES + 1) * 60_000;
export const OAUTH_REQUEST_TIMEOUT_MS = 15_000;
export const OAUTH_SCOPES = [
  'translations.view',
  'translations.edit',
  'translations.state-edit',
  'keys.view',
  'keys.edit',
  'screenshots.view',
  'screenshots.upload',
  'screenshots.delete',
].join(' ');
