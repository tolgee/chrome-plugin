export const POPUP_WIDTH = 400;

// The first @tolgee/web release planned to speak PROTOCOL_VERSION 2 (see src/protocol.ts); documentation only.
export const MIN_SDK_VERSION_LABEL = '7.2.0';

// Public client id pre-registered on every Tolgee backend (OAuth2ClientRegistry on the platform).
export const OAUTH_CLIENT_ID = 'tolgee-browser-extension';

export const OAUTH_REFRESH_SKEW_MS = 60_000;
export const OAUTH_REQUEST_TIMEOUT_MS = 15_000;
// Mirrors requiredScopes of this client in the platform's
// backend/data/src/main/kotlin/io/tolgee/security/oauth2/OAuth2ClientRegistry.kt.
export const REQUIRED_OAUTH_SCOPES = ['keys.view', 'translations.view'];
export const OPTIONAL_OAUTH_SCOPES = [
  'translations.edit',
  'translations.state-edit',
  'translations.suggest',
  'translation-suggestions.own-access',
  'translation-suggestions.manage',
  'keys.create',
  'keys.edit',
  'screenshots.view',
  'screenshots.upload',
  'screenshots.delete',
];
export const OAUTH_SCOPES = [
  ...REQUIRED_OAUTH_SCOPES,
  ...OPTIONAL_OAUTH_SCOPES,
];
