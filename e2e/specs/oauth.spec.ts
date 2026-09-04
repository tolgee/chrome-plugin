import { expect, test } from '../fixtures/extension';
import {
  completeAuthorization,
  installIdentityStub,
  storedOAuthSessions,
  requireOAuthServer,
} from '../fixtures/oauth';
import {
  collectProjectRequests,
  openInContextDialog,
  openTestapp,
  sessionItem,
} from '../fixtures/testapp';

requireOAuthServer();

test('signs in with OAuth, edits in context and signs out', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const host = new URL(state.tolgeeUrl).host;
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await installIdentityStub(worker);

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-oauth').click();
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('account-detail')).toHaveText(
    `Signed in on ${host}`
  );
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await expect(popup.getByTestId('project-link')).toHaveAttribute(
    'href',
    `${state.tolgeeUrl}/projects/${app.projectId}`
  );
  await expect(
    popup.getByTestId('editing-switch').locator('input')
  ).toBeChecked();
  const [session] = await storedOAuthSessions(worker);
  expect(session).toBeDefined();
  expect(await sessionItem(page, '__tolgee_projectId')).toBe(
    String(app.projectId)
  );

  const requests = collectProjectRequests(page);
  await openInContextDialog(page);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const headers = request.headers();
    expect(headers['authorization'], request.url()).toMatch(/^Bearer /);
    expect(headers['x-api-key'], request.url()).toBeUndefined();
  }

  const revokeCalls: string[] = [];
  context.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/oauth2/revoke')
    ) {
      revokeCalls.push(request.url());
    }
  });
  const reloadedAgain = page.waitForEvent('load');
  await popup.getByTestId('sign-out').click();
  await reloadedAgain;

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible({
    timeout: 30_000,
  });
  expect(await storedOAuthSessions(worker)).toHaveLength(0);
  expect(await sessionItem(page, '__tolgee_authToken')).toBeNull();
  // Revocation is the worker's fire-and-forget last step; the token being dead server-side is what proves it ran.
  await expect
    .poll(
      async () =>
        (
          await page.request.get(`${state.tolgeeUrl}/v2/user`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          })
        ).status(),
      { message: 'the revoked access token is rejected' }
    )
    .toBe(401);
  expect(revokeCalls).toEqual([`${state.tolgeeUrl}/oauth2/revoke`]);
});
