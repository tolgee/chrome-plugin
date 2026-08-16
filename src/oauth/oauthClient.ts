import browser from 'webextension-polyfill';
import { OAUTH_CLIENT_ID, OAUTH_SCOPES } from '../constants';
import { challengeFromVerifier, randomUrlSafe } from './pkce';
import { normalizeUrl } from './url';

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export class OAuthTokenEndpointError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`Tolgee token endpoint returned ${status}: ${body}`);
    this.name = 'OAuthTokenEndpointError';
  }
}

export const getRedirectUri = () => browser.identity.getRedirectURL();

export const login = async (
  apiUrl: string,
  projectId?: number
): Promise<OAuthTokens> => {
  const base = normalizeUrl(apiUrl);
  const verifier = randomUrlSafe();
  const redirectUri = getRedirectUri();

  const authorizeUrl = new URL(`${base}/oauth2/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', OAUTH_SCOPES);
  authorizeUrl.searchParams.set(
    'code_challenge',
    await challengeFromVerifier(verifier)
  );
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  const state = randomUrlSafe();
  authorizeUrl.searchParams.set('state', state);
  if (projectId != null) {
    authorizeUrl.searchParams.set('project', String(projectId));
  }

  const redirectResponse = await launchAuthWithRetry(authorizeUrl.toString());
  const redirectParams = new URL(redirectResponse).searchParams;
  if (redirectParams.get('state') !== state) {
    throw new Error('Tolgee authorization returned an unexpected state');
  }
  const error = redirectParams.get('error');
  if (error) {
    throw new Error(
      `Tolgee authorization failed: ${
        redirectParams.get('error_description') || error
      }`
    );
  }
  const code = redirectParams.get('code');
  if (!code) {
    throw new Error('Tolgee authorization did not return a code');
  }

  return postToken(base, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: OAUTH_CLIENT_ID,
    code_verifier: verifier,
  });
};

export const refresh = (
  apiUrl: string,
  refreshToken: string
): Promise<OAuthTokens> =>
  postToken(
    normalizeUrl(apiUrl),
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
    },
    refreshToken
  );

export const parseTokenResponse = (
  data: Record<string, any>,
  previousRefreshToken?: string
): OAuthTokens => {
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Tolgee token endpoint returned no access_token');
  }
  const expiresIn =
    typeof data.expires_in === 'number' && data.expires_in > 0
      ? data.expires_in
      : DEFAULT_TOKEN_LIFETIME_SECONDS;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
};

export const wasCancelledByUser = (message: string) =>
  /cancel|did not approve|denied|closed by the user/i.test(message);

const DEFAULT_TOKEN_LIFETIME_SECONDS = 5 * 60;

const postToken = async (
  base: string,
  params: Record<string, string>,
  previousRefreshToken?: string
): Promise<OAuthTokens> => {
  const res = await fetch(`${base}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OAuthTokenEndpointError(res.status, body);
  }
  return parseTokenResponse(await res.json(), previousRefreshToken);
};

const AUTH_MAX_ATTEMPTS = 3;
const AUTH_RETRY_DELAY_MS = 500;

// launchWebAuthFlow intermittently fails to load the bootstrap SPA; retry any launch failure but never a user cancel.
const launchAuthWithRetry = async (url: string): Promise<string> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt++) {
    try {
      return await browser.identity.launchWebAuthFlow({
        url,
        interactive: true,
      });
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      if (wasCancelledByUser(message) || attempt === AUTH_MAX_ATTEMPTS) {
        throw e;
      }
      console.warn(
        `[tolgee] authorization attempt ${attempt} failed, retrying`,
        message
      );
      await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
    }
  }
  throw lastError;
};
