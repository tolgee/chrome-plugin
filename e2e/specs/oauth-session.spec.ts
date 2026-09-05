import { apiAs, bearerStatus, revokeOAuthToken } from '../fixtures/api';
import { expect, test } from '../fixtures/extension';
import {
  collectWorkerRequests,
  completeAuthorization,
  expireStoredSessions,
  installIdentityStub,
  signInThroughPopup,
  storedOAuthSessions,
  requireOAuthServer,
} from '../fixtures/oauth';
import {
  collectProjectRequests,
  declareProject,
  DEV_TOOLS,
  dialogAsksToSignIn,
  dialogSaysEditingOff,
  editingSwitchInput,
  IN_CONTEXT_DIALOG_TEXT,
  openTestapp,
  responseStatuses,
  serveOldSdkPage,
  sessionItem,
  TITLE,
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

  await test.step('the worker drops the session after a 401 its refresh cannot cure, and the dialog says so', async () => {
    await page.locator(TITLE).click({ modifiers: ['Alt'] });
    await expect(page.locator(DEV_TOOLS)).toContainText(
      "You're not signed in",
      {
        timeout: 30_000,
      }
    );
    await expect(page.locator(DEV_TOOLS)).toContainText(
      'Sign in again in the Tolgee plugin'
    );
    await expect
      .poll(() => storedOAuthSessions(worker), {
        message: 'the dead session to be dropped',
      })
      .toHaveLength(0);
    await page.keyboard.press('Escape');
  });

  await test.step('the popup offers to sign in again', async () => {
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
  });

  await test.step('signing in again renews the session', async () => {
    await installIdentityStub(worker);
    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('sign-in-again').click();
    await completeAuthorization(flow);
    await reloaded;

    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('session-ended')).toHaveCount(0);
    await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
    await expect(editingSwitchInput(popup)).toBeChecked();
    const [renewed] = await storedOAuthSessions(worker);
    expect(renewed.accessToken).not.toBe(session.accessToken);
    await expect
      .poll(() => sessionItem(page, '__tolgee_session'))
      .toBe('oauth');
  });
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

  await test.step('sign out from here ends the session for the whole site', async () => {
    const reloaded = page.waitForEvent('load');
    await otherPopup.getByTestId('sign-out').click();
    await reloaded;
    await expect(otherPopup.getByTestId('sign-in-screen')).toBeVisible();
    expect(await storedOAuthSessions(worker)).toHaveLength(0);
    expect(await sessionItem(page, '__tolgee_session')).toBeNull();
    expect(await sessionItem(otherPage, '__tolgee_session')).toBeNull();
  });
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

  const second = await context.newPage();
  await openTestapp(second, app.url);
  await test.step('a second tab of the same site starts without the signed-in flag (sessionStorage is per tab) but is still signed in', async () => {
    expect(await sessionItem(second, '__tolgee_session')).toBeNull();
    expect(await sessionItem(second, '__tolgee_editing')).toBeNull();
    const secondPopup = await openPopup(second);
    await expect(secondPopup.getByTestId('connected-panel')).toBeVisible();
    await expect(secondPopup.getByTestId('project-link')).toHaveText(
      app.projectName
    );
    const secondSwitch = editingSwitchInput(secondPopup);
    await expect(secondSwitch).not.toBeChecked();
    await expect(secondPopup.getByTestId('editing-hint')).toHaveText(
      'You stay signed in. Turn it on to edit here.'
    );
    await expect(secondPopup.getByTestId('project-link')).toHaveText(
      app.projectName
    );
    expect(await sessionItem(second, '__tolgee_editing')).toBeNull();

    const secondReloaded = second.waitForEvent('load');
    await secondSwitch.click();
    await secondReloaded;
    await expect(secondSwitch).toBeChecked();
    expect(await sessionItem(second, '__tolgee_session')).toBe('oauth');
    expect(await sessionItem(second, '__tolgee_projectKey')).toBe(
      session.projectKey
    );
    await secondPopup.close();
  });

  await test.step('every open tab of the origin is cleared on sign out, whether or not it was ever applied from', async () => {
    await page.bringToFront();
    const firstReloaded = page.waitForEvent('load');
    const secondReloadedAgain = second.waitForEvent('load');
    await popup.getByTestId('sign-out').click();
    await Promise.all([firstReloaded, secondReloadedAgain]);

    await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
    expect(await sessionItem(page, '__tolgee_session')).toBeNull();
    expect(await sessionItem(second, '__tolgee_session')).toBeNull();
    expect(await storedOAuthSessions(worker)).toHaveLength(0);
    await expect
      .poll(() => bearerStatus(state.tolgeeUrl, session.accessToken))
      .toBe(401);
  });
});

test('tells the dialog editing is switched off, and asks to sign in again once signed out', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  let popup = await openPopup(page);
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

  await test.step('switching editing off keeps alt+click working, with the dialog explaining the switch', async () => {
    const editingSwitch = editingSwitchInput(popup);
    const reloaded = page.waitForEvent('load');
    await editingSwitch.click();
    await reloaded;
    await expect(editingSwitch).not.toBeChecked();
    expect(await sessionItem(page, '__tolgee_session')).toBeNull();
    expect(await sessionItem(page, '__tolgee_editing')).toBe('off');
    expect(await dialogSaysEditingOff(page)).toBe(true);
  });

  await test.step('a popup opened later, which restores the session for the page, keeps the switch and the dialog as they were', async () => {
    await popup.close();
    popup = await openPopup(page);
    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
    await expect(editingSwitchInput(popup)).not.toBeChecked();
    expect(await sessionItem(page, '__tolgee_editing')).toBe('off');
    expect(await dialogSaysEditingOff(page)).toBe(true);
  });

  await test.step('signing out clears the switch: the dialog asks to sign in', async () => {
    await popup.getByTestId('sign-out').click();
    await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
    await expect.poll(() => sessionItem(page, '__tolgee_editing')).toBeNull();
    expect(await storedOAuthSessions(worker)).toHaveLength(0);
    expect(await dialogAsksToSignIn(page)).toBe(true);
  });
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
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
});

test('refreshes an expired token before sending for the page', async ({
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
  await popup.close();

  await expireStoredSessions(worker);

  const pageRequests = collectProjectRequests(page);
  const workerRequests = collectWorkerRequests(context);
  await page.locator(TITLE).click({ modifiers: ['Alt'] });
  await expect(
    page.locator(DEV_TOOLS).getByText(IN_CONTEXT_DIALOG_TEXT)
  ).toBeVisible({ timeout: 30_000 });

  await test.step('the worker rotates the expired token on the first dialog request and sends the new one', async () => {
    await expect
      .poll(async () => (await storedOAuthSessions(worker))[0]?.accessToken, {
        message: 'the worker to rotate the expired token',
      })
      .not.toBe(session.accessToken);
    const [refreshed] = await storedOAuthSessions(worker);
    expect(refreshed.expiresAt).toBeGreaterThan(Date.now());
    await expect
      .poll(() => workerRequests.length, {
        message: 'the worker to send the dialog requests',
      })
      .toBeGreaterThan(0);
    await Promise.all(workerRequests.map((request) => request.response()));
    expect(pageRequests).toEqual([]);
    for (const request of workerRequests) {
      expect((await request.allHeaders())['authorization'], request.url()).toBe(
        `Bearer ${refreshed.accessToken}`
      );
    }
  });
  await test.step('none of the dialog requests, optional-feature probes included, fails as an auth failure', async () => {
    for (const status of await responseStatuses(workerRequests)) {
      expect(status).not.toBe(401);
      expect(status).not.toBe(403);
    }
  });
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

test('shows the sdk-too-old alert and disables editing for an existing session on a page whose SDK cannot proxy requests', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const signInPopup = await openPopup(page);
  await signInThroughPopup({
    popup: signInPopup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });

  // Same origin as the stored session, but this page's own SDK reports no protocolVersion (pre-proxy-protocol).
  await serveOldSdkPage(page, app.url, {
    apiUrl: state.tolgeeUrl,
    projectId: app.projectId,
  });

  const popup = await openPopup(page);
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('sdk-too-old')).toContainText(
    'Sign-in needs a newer Tolgee SDK'
  );
  await expect(editingSwitchInput(popup)).toBeDisabled();
});
