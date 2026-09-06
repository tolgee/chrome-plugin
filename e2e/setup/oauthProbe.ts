import { log } from './env';

export type OAuthAvailability = {
  available: boolean;
  reason?: string;
  /** The server has the authorization server, but the extension's redirect URI is not registered on it. */
  redirectUriRejected?: boolean;
};

const METADATA_PATH = '/.well-known/oauth-authorization-server';
const CLIENT_ID = 'tolgee-browser-extension';

/**
 * Whether the server can sign the extension in: it serves the RFC 8414 metadata (the authorization server exists and
 * has at least one client registered) and `/oauth2/authorize` accepts the extension's client id and redirect URI. The
 * platform answers the latter with a redirect once both are validated and with 400 otherwise, before it looks at
 * any other parameter.
 */
export const probeOAuthServer = async (
  tolgeeUrl: string,
  extensionId: string
): Promise<OAuthAvailability> => {
  const unavailable = (
    reason: string,
    redirectUriRejected = false
  ): OAuthAvailability => {
    log(`OAuth server not usable: ${reason}`);
    return { available: false, reason, redirectUriRejected };
  };
  const metadata = await fetch(`${tolgeeUrl}${METADATA_PATH}`, {
    headers: { Accept: 'application/json' },
  });
  if (
    !metadata.ok ||
    !(metadata.headers.get('content-type') ?? '').includes('json')
  ) {
    return unavailable(
      `${tolgeeUrl}${METADATA_PATH} answered HTTP ${metadata.status}; the server has no OAuth authorization server ` +
        '(tolgee/tolgee-platform#3893) or no OAuth client is configured'
    );
  }
  const redirectUri = `https://${extensionId}.chromiumapp.org/`;
  const authorize = new URL(`${tolgeeUrl}/oauth2/authorize`);
  authorize.searchParams.set('client_id', CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri);
  const res = await fetch(authorize, { redirect: 'manual' });
  if (res.status < 300 || res.status >= 400) {
    return unavailable(
      `${authorize.pathname} rejected client ${CLIENT_ID} with redirect URI ${redirectUri}: HTTP ${res.status} ` +
        `${(await res.text()).slice(0, 200)}`.trim() +
        '; register it through tolgee.oauth2.browser-extension-redirect-uris',
      true
    );
  }
  log(`OAuth server available, redirect URI ${redirectUri} is registered`);
  return { available: true };
};
