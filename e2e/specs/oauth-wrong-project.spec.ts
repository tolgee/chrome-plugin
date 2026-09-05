import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import {
  completeAuthorization,
  installIdentityStub,
  requireOAuthServer,
  storedOAuthSessions,
  waitForAuthorizeUrl,
} from '../fixtures/oauth';
import {
  declareProject,
  openInContextDialog,
  openTestapp,
  sessionItem,
  signInAlert,
} from '../fixtures/testapp';

requireOAuthServer();

const MISSING_PROJECT_ID = 987654321;

const collectRevokeCalls = (context: BrowserContext): string[] => {
  const calls: string[] = [];
  context.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/oauth2/revoke')
    ) {
      calls.push(request.url());
    }
  });
  return calls;
};

/** The refusal the worker parked for a page origin (see oauth/connectRefusalStore.ts), if any. */
const storedRefusal = (worker: Worker, origin: string) =>
  worker.evaluate(
    (key) =>
      (chrome.storage.session ?? chrome.storage.local)
        .get(key)
        .then((r: any) => r[key] ?? null),
    `connectRefusal:${origin}`
  );

/** The extension's sign-in connection for a page origin (see oauth/connection.ts), if any. */
const originConnection = (worker: Worker, origin: string) =>
  worker.evaluate(
    (key) => chrome.storage.local.get(key).then((r: any) => r[key]),
    origin
  );

const expectRefused = async ({
  popup,
  page,
  worker,
  projectId,
  host,
}: {
  popup: Page;
  page: Page;
  worker: Worker;
  projectId: number;
  host: string;
}) => {
  const alert = popup.getByTestId('connect-project-inaccessible');
  await expect(alert).toContainText(
    `This account can't access project #${projectId} on ${host}`
  );
  await expect(alert).toContainText(
    'Sign in with an account that has access to it. The project may also no longer exist in Tolgee.'
  );
  await expect(popup.getByTestId('connect-error')).toHaveCount(0);
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await expect(popup.getByTestId('connect-oauth')).toHaveText(
    'Connect to Tolgee'
  );
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();

  expect(await storedOAuthSessions(worker)).toHaveLength(0);
  expect(
    await originConnection(worker, new URL(page.url()).origin)
  ).toBeUndefined();
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();

  await test.step('the page is still signed out: its dialog asks to sign in', async () => {
    await page.bringToFront();
    await openInContextDialog(page);
    await expect(signInAlert(page)).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
  });
};

test('refuses a consent given for another project than the one the page declares', async ({
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
  await installIdentityStub(worker);
  const revokeCalls = collectRevokeCalls(context);

  await popup.getByTestId('connect-oauth').click();
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
    project: { kind: 'one', name: other.projectName },
  });

  await expectRefused({ popup, page, worker, projectId: app.projectId, host });
  await test.step('the grant that was never stored is revoked on the server', async () => {
    await expect
      .poll(() => revokeCalls, { message: 'the worker to revoke the grant' })
      .toEqual([`${state.tolgeeUrl}/oauth2/revoke`]);
  });
});

test('refuses to connect a page declaring a project that does not exist, even with a consent for all projects', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const host = new URL(state.tolgeeUrl).host;
  await declareProject(page, app.url, MISSING_PROJECT_ID);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await installIdentityStub(worker);

  await popup.getByTestId('connect-oauth').click();
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
    project: { kind: 'all' },
  });

  await expectRefused({
    popup,
    page,
    worker,
    projectId: MISSING_PROJECT_ID,
    host,
  });
});

test('connects with a consent for all projects when the declared project exists', async ({
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
    project: { kind: 'all' },
  });
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  expect(await storedOAuthSessions(worker)).toHaveLength(1);
  await expect.poll(() => sessionItem(page, '__tolgee_session')).toBe('oauth');
});

// In a real browser the identity window closes the action popup, so the refusal reply above is never received:
// the worker parks it for the origin and the popup shows it when it opens again.
test('shows the refusal on a popup opened after the flow, when the popup was closed while it ran', async ({
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
  const first = await openPopup(page);
  await installIdentityStub(worker);

  await first.getByTestId('connect-oauth').click();
  await waitForAuthorizeUrl(worker);
  await first.close();
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
    project: { kind: 'one', name: other.projectName },
  });
  await expect
    .poll(() => storedRefusal(worker, new URL(page.url()).origin), {
      message: 'the worker to park the refusal for the page origin',
    })
    .toMatchObject({
      code: 'project_inaccessible',
      projectId: app.projectId,
      apiUrl: state.tolgeeUrl,
    });

  const popup = await openPopup(page);
  await expectRefused({ popup, page, worker, projectId: app.projectId, host });

  await test.step('dismissing the alert leaves a clean sign-in screen, also on the next popup', async () => {
    await popup.getByTestId('dismiss-connect-refusal').click();
    await expect(popup.getByTestId('connect-project-inaccessible')).toHaveCount(
      0
    );
    await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
    await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
    await expect
      .poll(() => storedRefusal(worker, new URL(page.url()).origin))
      .toBeNull();

    const again = await openPopup(page);
    await expect(again.getByTestId('connect-oauth')).toBeEnabled();
    await expect(again.getByTestId('connect-project-inaccessible')).toHaveCount(
      0
    );
  });
});

test('drops a parked refusal once a later attempt connects', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
  await openTestapp(page, app.url);
  const first = await openPopup(page);
  await installIdentityStub(worker);
  await first.getByTestId('connect-oauth').click();
  await waitForAuthorizeUrl(worker);
  await first.close();
  await completeAuthorization({
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
    project: { kind: 'one', name: other.projectName },
  });
  await expect
    .poll(() => storedRefusal(worker, new URL(page.url()).origin))
    .not.toBeNull();

  const popup = await openPopup(page);
  await expect(popup.getByTestId('connect-project-inaccessible')).toBeVisible();
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
  await expect(popup.getByTestId('connect-project-inaccessible')).toHaveCount(
    0
  );
  expect(await storedRefusal(worker, new URL(page.url()).origin)).toBeNull();
});
