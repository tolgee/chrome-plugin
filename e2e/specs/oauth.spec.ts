import { expect, test } from '../fixtures/extension';
import {
  collectWorkerRequests,
  completeAuthorization,
  installIdentityStub,
  storedOAuthSessions,
  requireOAuthServer,
} from '../fixtures/oauth';
import {
  collectProjectRequests,
  editingSwitchInput,
  openInContextDialog,
  openTestapp,
  sessionItem,
  TITLE,
} from '../fixtures/testapp';

requireOAuthServer();

test('signs in with OAuth, edits in context through the extension and signs out', async ({
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
  await expect(popup.getByTestId('connection-summary')).toContainText(
    "You're signed in"
  );
  await expect(popup.getByTestId('connection-summary')).toContainText(
    `Edits you make on this page are saved to ${app.projectName} in Tolgee.`
  );
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await expect(popup.getByTestId('project-link')).toHaveAttribute(
    'href',
    `${state.tolgeeUrl}/projects/${app.projectId}`
  );
  await expect(editingSwitchInput(popup)).toBeChecked();
  const [session] = await storedOAuthSessions(worker);
  expect(session).toBeDefined();
  expect(await sessionItem(page, '__tolgee_projectId')).toBe(
    String(app.projectId)
  );
  expect(await sessionItem(page, '__tolgee_session')).toBe('oauth');

  await test.step('the page itself never talks to the project API; the worker does, with the session token', async () => {
    const pageRequests = collectProjectRequests(page);
    const workerRequests = collectWorkerRequests(context);
    await openInContextDialog(page);
    // The dialog title renders before its queries go out; wait for the worker to have sent them for this project.
    await expect
      .poll(
        () =>
          workerRequests.some((request) =>
            request.url().includes(`/v2/projects/${app.projectId}/`)
          ),
        { message: 'the worker to send the dialog requests' }
      )
      .toBe(true);
    await Promise.all(workerRequests.map((request) => request.response()));
    expect(pageRequests).toEqual([]);
    for (const request of workerRequests) {
      const headers = await request.allHeaders();
      expect(headers['authorization'], request.url()).toMatch(/^Bearer /);
      expect(headers['x-api-key'], request.url()).toBeUndefined();
    }
  });

  await test.step("a hard reload renders through the worker right away, not after the page's extension-unavailable fallback", async () => {
    const afterReload = collectWorkerRequests(context, (request) =>
      request.url().includes(`/v2/projects/${app.projectId}/translations/`)
    );
    await page.reload();
    await expect(page.locator(TITLE)).toBeVisible();
    await expect
      .poll(async () => (await afterReload[0]?.response())?.status(), {
        timeout: 10_000,
        message:
          'the worker to load the in-context translations after a reload',
      })
      .toBe(200);
  });

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
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
  await test.step("sign out revokes the token server-side, as the worker's fire-and-forget last step", async () => {
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
});
