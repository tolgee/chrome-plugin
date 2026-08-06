import browser from 'webextension-polyfill';
import { OAUTH_CLIENT_ID, OAUTH_SCOPES } from '../constants';
import { challengeFromVerifier, randomUrlSafe } from './pkce';

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  // epoch milliseconds at which the access token expires
  expiresAt: number;
};

const normalizeUrl = (url: string) => url.replace(/\/$/, '');

export const getRedirectUri = () => browser.identity.getRedirectURL();

const parseTokenResponse = (
  data: Record<string, any>,
  previousRefreshToken?: string
): OAuthTokens => ({
  accessToken: data.access_token,
  // rotation returns a fresh refresh token; if a response omits it, keep the previous one
  refreshToken: data.refresh_token ?? previousRefreshToken,
  expiresAt: Date.now() + (data.expires_in ?? 0) * 1000,
});

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
    throw new Error(`Tolgee token endpoint returned ${res.status}: ${body}`);
  }
  return parseTokenResponse(await res.json(), previousRefreshToken);
};

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
  authorizeUrl.searchParams.set('state', randomUrlSafe());
  if (projectId != null) {
    authorizeUrl.searchParams.set('project', String(projectId));
  }

  const redirectResponse = await browser.identity.launchWebAuthFlow({
    url: authorizeUrl.toString(),
    interactive: true,
  });
  const code = new URL(redirectResponse).searchParams.get('code');
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
