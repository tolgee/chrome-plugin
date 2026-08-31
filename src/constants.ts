export const API_KEY_LOCAL_STORAGE = '__tolgee_apiKey';
export const API_URL_LOCAL_STORAGE = '__tolgee_apiUrl';
export const BRANCH_LOCAL_STORAGE = '__tolgee_branch';
export const AUTH_TOKEN_LOCAL_STORAGE = '__tolgee_authToken';
export const PROJECT_ID_LOCAL_STORAGE = '__tolgee_projectId';

// Public client id pre-registered on every Tolgee backend (see PreRegisteredClients on the platform).
export const OAUTH_CLIENT_ID = 'tolgee-browser-extension';
export const OAUTH_REFRESH_SKEW_MS = 60_000;
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
