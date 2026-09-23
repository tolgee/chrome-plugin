import { TolgeeApi, type User } from '../setup/seed';
import type { RunState } from '../setup/state';

/** A public-API client signed in as the seeded user (or another one) on the run's Tolgee server. */
export const apiAs = async (state: RunState, user: User = state.user) => {
  const api = new TolgeeApi(state.tolgeeUrl);
  await api.login(user);
  return api;
};

/** What the server says about an API key, or the HTTP status it rejects it with. */
export const apiKeyStatus = async (
  tolgeeUrl: string,
  apiKey: string
): Promise<number> =>
  (
    await fetch(`${tolgeeUrl}/v2/api-keys/current`, {
      headers: { 'X-API-Key': apiKey },
    })
  ).status;

/** The status the server answers a Bearer token with on the user endpoint (401 once the grant is gone). */
export const bearerStatus = async (
  tolgeeUrl: string,
  token: string
): Promise<number> =>
  (
    await fetch(`${tolgeeUrl}/v2/user`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).status;

/** RFC 7009 revocation, as the server itself would after the user signs out everywhere. */
export const revokeOAuthToken = async (tolgeeUrl: string, token: string) => {
  const res = await fetch(`${tolgeeUrl}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: 'tolgee-browser-extension' }),
  });
  if (!res.ok) {
    throw new Error(`revoke failed: HTTP ${res.status}`);
  }
};

/** A user whose role lacks most optional scopes. */
export const signUpViewer = async (state: RunState): Promise<User> => {
  const api = await apiAs(state);
  const { code } = await api.request(
    'PUT',
    `projects/${state.apps[0].projectId}/invite`,
    { type: 'VIEW', name: 'viewer' }
  );
  const user = {
    username: `viewer-${Date.now()}@e2e.test`,
    password: 'viewer-password',
  };
  const res = await fetch(`${state.tolgeeUrl}/api/public/sign_up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Viewer',
      email: user.username,
      password: user.password,
      invitationCode: code,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `viewer sign-up failed: HTTP ${res.status} ${await res.text()}`
    );
  }
  return user;
};
