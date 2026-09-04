import { apiAs, bearerStatus, revokeOAuthToken } from '../fixtures/api';
import { expect, test } from '../fixtures/extension';
import {
  completeAuthorization,
  expireStoredSessions,
  fireRefreshAlarm,
  installIdentityStub,
  signInThroughPopup,
  storedOAuthSessions,
  requireOAuthServer,
} from '../fixtures/oauth';
import {
  collectProjectRequests,
  declareProject,
  openInContextDialog,
  openTestapp,
  responseStatuses,
  sessionItem,
} from '../fixtures/testapp';

requireOAuthServer();

test('offers to sign in again once the session was revoked on the server', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const flow = {
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  };
  await openTestapp(page, app.url);
  let popup = await openPopup(page);
  await signInThroughPopup({ ...flow, popup });
  const [session] = await storedOAuthSessions(worker);
  await popup.close();

  await revokeOAuthToken(state.tolgeeUrl, session.accessToken);
  expect(await bearerStatus(state.tolgeeUrl, session.accessToken)).toBe(401);

  popup = await openPopup(page);
  await expect(popup.getByTestId('session-ended')).toContainText(
    'Your session ended'
  );
  await expect(popup.getByTestId('session-ended')).toContainText(
    'It expired or was revoked on the server.'
  );
  await expect(popup.getByTestId('account-detail')).toHaveText(
    `Signed in on ${new URL(state.tolgeeUrl).host}`
  );
  await expect(popup.getByTestId('editing-switch')).toHaveCount(0);
  await expect(popup.getByTestId('sign-out')).toHaveCount(0);

  await installIdentityStub(worker);
  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('sign-in-again').click();
  await completeAuthorization(flow);
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('session-ended')).toHaveCount(0);
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await expect(
    popup.getByTestId('editing-switch').locator('input')
  ).toBeChecked();
  const [renewed] = await storedOAuthSessions(worker);
  expect(renewed.accessToken).not.toBe(session.accessToken);
  await expect
    .poll(() => sessionItem(page, '__tolgee_authToken'))
    .toBe(renewed.accessToken);
});

// The access token is bound to the project chosen at consent, so a page of the same site that declares another
// project on that server is one this session cannot reach (the same as a project the user has no access to). A
// page that holds the injected credentials reports the session's own project instead, so the mismatch shows up in
// a tab that does not carry them yet.
test('warns when the page declares a project the session cannot reach', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
  const host = new URL(state.tolgeeUrl).host;
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await signInThroughPopup({
    popup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await popup.close();

  const otherPage = await context.newPage();
  await declareProject(otherPage, app.url, other.projectId);
  await openTestapp(otherPage, app.url);

  const otherPopup = await openPopup(otherPage);
  await expect(otherPopup.getByTestId('project-inaccessible')).toContainText(
    "No access to this page's project"
  );
  await expect(otherPopup.getByTestId('project-inaccessible')).toContainText(
    `This site requests a project this session can't reach on ${host}.`
  );
  await expect(otherPopup.getByTestId('footer-note')).toHaveText(
    `Project #${other.projectId} on ${host}`
  );
  await expect(otherPopup.getByTestId('account-detail')).toHaveText(
    `Signed in on ${host}`
  );
  await expect(otherPopup.getByTestId('project-link')).toHaveCount(0);
  await expect(otherPopup.getByTestId('editing-switch')).toHaveCount(0);
  await expect(otherPopup.getByTestId('sign-out')).toHaveText('Sign out');

  // Sign out from here ends the session for the whole site.
  const reloaded = page.waitForEvent('load');
  await otherPopup.getByTestId('sign-out').click();
  await reloaded;
  await expect(otherPopup.getByTestId('sign-in-screen')).toBeVisible();
  expect(await storedOAuthSessions(worker)).toHaveLength(0);
  expect(await sessionItem(page, '__tolgee_authToken')).toBeNull();
  expect(await sessionItem(otherPage, '__tolgee_authToken')).toBeNull();
});

test('ends the session in every tab of the origin on sign out', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await signInThroughPopup({
    popup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });
  const [session] = await storedOAuthSessions(worker);

  // A second tab of the same site starts without the token (sessionStorage is per tab) but is still signed in.
  const second = await context.newPage();
  await openTestapp(second, app.url);
  expect(await sessionItem(second, '__tolgee_authToken')).toBeNull();
  const secondPopup = await openPopup(second);
  await expect(secondPopup.getByTestId('connected-panel')).toBeVisible();
  await expect(secondPopup.getByTestId('project-link')).toHaveText(
    app.projectName
  );
  const secondSwitch = secondPopup
    .getByTestId('editing-switch')
    .locator('input');
  await expect(secondSwitch).not.toBeChecked();
  await expect(secondPopup.getByTestId('editing-hint')).toHaveText(
    'You stay signed in. Turn it on to edit here.'
  );

  const secondReloaded = second.waitForEvent('load');
  await secondSwitch.click();
  await secondReloaded;
  await expect(secondSwitch).toBeChecked();
  expect(await sessionItem(second, '__tolgee_authToken')).toBe(
    session.accessToken
  );
  await secondPopup.close();

  // Both tabs are known to the worker, so both get cleared on sign out.
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local
          .get('injectedTabs')
          .then((r: any) => Object.values(r.injectedTabs ?? {}))
      )
    )
    .toHaveLength(2);

  await page.bringToFront();
  const firstReloaded = page.waitForEvent('load');
  const secondReloadedAgain = second.waitForEvent('load');
  await popup.getByTestId('sign-out').click();
  await Promise.all([firstReloaded, secondReloadedAgain]);

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  expect(await sessionItem(page, '__tolgee_authToken')).toBeNull();
  expect(await sessionItem(second, '__tolgee_authToken')).toBeNull();
  expect(await storedOAuthSessions(worker)).toHaveLength(0);
  await expect
    .poll(() => bearerStatus(state.tolgeeUrl, session.accessToken))
    .toBe(401);
});

test('reports a denied consent and stores nothing', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await installIdentityStub(worker);

  await popup.getByTestId('connect-oauth').click();
  await expect(popup.getByTestId('connect-oauth')).toHaveText('Connecting...');
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
    decision: 'deny',
  });

  await expect(popup.getByTestId('connect-error')).toContainText(
    'access_denied'
  );
  await expect(popup.getByTestId('connect-error')).not.toHaveText(/^Error:/);
  await expect(popup.getByTestId('connect-oauth')).toHaveText(
    'Connect to Tolgee'
  );
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  expect(await storedOAuthSessions(worker)).toHaveLength(0);
  expect(await sessionItem(page, '__tolgee_authToken')).toBeNull();
});

test('refreshes an expired token in the background', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await signInThroughPopup({
    popup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });
  const [session] = await storedOAuthSessions(worker);
  expect(session.refreshToken).toBeTruthy();
  expect(await sessionItem(page, '__tolgee_authToken')).toBe(
    session.accessToken
  );
  await popup.close();

  await expireStoredSessions(worker);
  await fireRefreshAlarm(worker);

  await expect
    .poll(() => sessionItem(page, '__tolgee_authToken'), {
      message: 'the page to receive a refreshed token',
    })
    .not.toBe(session.accessToken);
  const [refreshed] = await storedOAuthSessions(worker);
  expect(refreshed.accessToken).not.toBe(session.accessToken);
  expect(refreshed.expiresAt).toBeGreaterThan(Date.now());
  expect(await sessionItem(page, '__tolgee_authToken')).toBe(
    refreshed.accessToken
  );

  const requests = collectProjectRequests(page);
  await openInContextDialog(page);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.headers()['authorization'], request.url()).toBe(
      `Bearer ${refreshed.accessToken}`
    );
  }
  // The dialog also probes optional features (branches), which may answer 4xx on their own; none may be an auth failure.
  for (const status of await responseStatuses(requests)) {
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  }
  expect(await bearerStatus(state.tolgeeUrl, session.accessToken)).toBe(401);
});

test('shows the signed-in account by its name', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const me = await (await apiAs(state)).currentUser();
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await signInThroughPopup({
    popup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });

  await expect(popup.getByTestId('connected-panel')).toContainText(
    'Tolgee plugin'
  );
  // The platform's oauth2-consent test-data user has no name, so the internal seed mode exercises the fallback.
  await expect(popup.getByTestId('account-name')).toHaveText(
    me.name || 'Tolgee account'
  );
  await expect(popup.getByTestId('editing-title')).toHaveText(
    'In-context editing on this page'
  );
  await expect(popup.getByTestId('sign-out')).toHaveText('Sign out');
});
