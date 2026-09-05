export const POPUP_WIDTH = 400;

// The first @tolgee/web release planned to speak PROTOCOL_VERSION 2 (see src/protocol.ts); documentation only.
export const MIN_SDK_VERSION_LABEL = '7.2.0';

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
