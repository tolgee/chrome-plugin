export const API_KEY_LOCAL_STORAGE = '__tolgee_apiKey';
export const API_URL_LOCAL_STORAGE = '__tolgee_apiUrl';
export const BRANCH_LOCAL_STORAGE = '__tolgee_branch';
// OAuth access token injected into the page alongside the api key; the SDK (tolgee-js) reads it as a Bearer token.
export const AUTH_TOKEN_LOCAL_STORAGE = '__tolgee_authToken';

// Fixed public client id pre-registered on every Tolgee backend (see PreRegisteredClients on the platform).
export const OAUTH_CLIENT_ID = 'tolgee-browser-extension';
// Access tokens are short-lived; refresh this many milliseconds before expiry.
export const OAUTH_REFRESH_SKEW_MS = 60_000;
// Scopes the extension requests for in-context editing. The backend intersects them with the user's live
// permissions, so requesting a broad set never grants more than the user actually holds.
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
