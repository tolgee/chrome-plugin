import { bearerStatus, signUpViewer } from '../fixtures/api';
import { expect, test } from '../fixtures/extension';
import type { RunState, TestApp } from '../setup/state';
import {
  completeAuthorization,
  installIdentityStub,
  storedOAuthSessions,
  requireOAuthServer,
  workerSaysMissingPermissions,
} from '../fixtures/oauth';
import { editingSwitchInput, openTestapp } from '../fixtures/testapp';

requireOAuthServer();

test('names the permissions a sign-in lacks, and lets the user sign in again for them', async ({
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
  const connection = locatorFor(state, app);
  await openTestapp(page, app.url);
  let popup = await openPopup(page);

  await test.step('a permission unticked at consent is missing from the grant', async () => {
    await installIdentityStub(worker);
    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('connect-oauth').click();
    await completeAuthorization({
      ...flow,
      declineScopes: ['translations.edit'],
    });
    await reloaded;
    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    const [session] = await storedOAuthSessions(worker);
    expect(session.scopes).not.toContain('translations.edit');
    expect(await workerSaysMissingPermissions(popup, connection)).toContain(
      'translations.edit'
    );
  });

  await test.step('the popup lists it in words, while editing stays available', async () => {
    await expect(popup.getByTestId('missing-permissions')).toContainText(
      "This sign-in doesn't have all permissions"
    );
    await expect(popup.getByTestId('missing-permissions-toggle')).toHaveText(
      '1 missing permission'
    );
    await expect(popup.getByTestId('missing-permission')).not.toBeVisible();
    await popup.getByTestId('missing-permissions-toggle').click();
    await expect(
      popup.getByTestId('missing-permissions-toggle')
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      popup.locator(
        '[data-testid="missing-permission"][data-scope="translations.edit"]'
      )
    ).toHaveText('Edit translations');
    await expect(editingSwitchInput(popup)).toBeChecked();
    await expect(popup.getByTestId('sign-out')).toBeVisible();
  });

  await test.step('dismissing it keeps it away for this browser session', async () => {
    await popup.getByTestId('missing-permissions').getByTitle('Close').click();
    await expect(popup.getByTestId('missing-permissions')).toHaveCount(0);
    await popup.close();
    popup = await openPopup(page);
    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('missing-permissions')).toHaveCount(0);
    expect(await workerSaysMissingPermissions(popup, connection)).toContain(
      'translations.edit'
    );
  });

  await test.step('signing out and in again forgets the dismissal', async () => {
    await popup.getByTestId('sign-out').click();
    await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
    await installIdentityStub(worker);
    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('connect-oauth').click();
    await completeAuthorization({
      ...flow,
      declineScopes: ['translations.edit', 'screenshots.upload'],
    });
    await reloaded;
    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await popup.close();
    popup = await openPopup(page);
    await expect(popup.getByTestId('missing-permissions')).toBeVisible();
  });

  await test.step('the disclosure counts what it holds, and closes again', async () => {
    const toggle = popup.getByTestId('missing-permissions-toggle');
    await expect(toggle).toHaveText('2 missing permissions');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(popup.getByTestId('missing-permission')).toHaveCount(2);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      popup.getByTestId('missing-permission').first()
    ).not.toBeVisible();
  });

  await test.step('a denied consent on signing in again leaves the working session connected', async () => {
    const [session] = await storedOAuthSessions(worker);
    await installIdentityStub(worker);
    await popup.getByTestId('sign-in-again-for-permissions').click();
    await expect(
      popup.getByTestId('sign-in-again-for-permissions')
    ).toBeDisabled();
    await completeAuthorization({ ...flow, decision: 'deny' });

    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('missing-permissions')).toBeVisible();
    await expect(editingSwitchInput(popup)).toBeChecked();
    const [kept] = await storedOAuthSessions(worker);
    expect(kept.accessToken).toBe(session.accessToken);
    expect(await bearerStatus(state.tolgeeUrl, session.accessToken)).toBe(200);
  });

  await test.step('signing in again with everything allowed replaces the grant without reloading the page', async () => {
    const [session] = await storedOAuthSessions(worker);
    await installIdentityStub(worker);
    let pageLoads = 0;
    page.on('load', () => pageLoads++);
    await popup.getByTestId('sign-in-again-for-permissions').click();
    await completeAuthorization(flow);

    await expect(popup.getByTestId('missing-permissions')).toHaveCount(0);
    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(editingSwitchInput(popup)).toBeChecked();
    expect(pageLoads, 'only the token in the worker changed').toBe(0);
    const [renewed] = await storedOAuthSessions(worker);
    expect(renewed.accessToken).not.toBe(session.accessToken);
    expect(renewed.scopes).toContain('translations.edit');
    expect(await workerSaysMissingPermissions(popup, connection)).toEqual([]);
    expect(await bearerStatus(state.tolgeeUrl, session.accessToken)).toBe(401);
    expect(await bearerStatus(state.tolgeeUrl, renewed.accessToken)).toBe(200);
  });
});

test('names only permissions the user could have: a scope the role lacks is never listed, a scope the credential lacks is', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const viewer = await signUpViewer(state);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await installIdentityStub(worker);
  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-oauth').click();
  // VIEW holds screenshots.view but neither upload nor delete, which the consent screen keeps ticked above it and
  // which block unticking it; of the three unticked here only screenshots.view is one the viewer could have.
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: viewer,
    target: page,
    declineScopes: [
      'screenshots.delete',
      'screenshots.upload',
      'screenshots.view',
    ],
  });
  await reloaded;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();

  const [session] = await storedOAuthSessions(worker);
  expect(session.scopes).not.toContain('screenshots.view');
  expect(session.scopes).toContain('translations.edit');
  expect(
    await workerSaysMissingPermissions(popup, locatorFor(state, app))
  ).toEqual(['screenshots.view']);

  await expect(popup.getByTestId('missing-permissions')).toBeVisible();
  await popup.getByTestId('missing-permissions-toggle').click();
  await expect(popup.getByTestId('missing-permission')).toHaveCount(1);
  await expect(
    popup.locator(
      '[data-testid="missing-permission"][data-scope="screenshots.view"]'
    )
  ).toHaveText('View screenshots');
});

const locatorFor = (state: RunState, app: TestApp) => ({
  apiUrl: state.tolgeeUrl,
  projectKey: String(app.projectId),
  pageOrigin: new URL(app.url).origin,
});
