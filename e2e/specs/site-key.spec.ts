import { apiAs } from '../fixtures/api';
import { collectWorkerRequests, signInThroughPopup } from '../fixtures/oauth';
import {
  type BrowserContext,
  expect,
  type Page,
  test,
} from '../fixtures/extension';
import {
  collectProjectRequests,
  collectWorkerProjectRequests,
  declareApiKey,
  dialogAsksToSignIn,
  openInContextDialog,
  sessionItem,
  TITLE,
} from '../fixtures/testapp';
import type { RunState } from '../setup/state';

// A page whose own Tolgee config carries an API key (the SDK's development mode): the extension can only override
// that key, never remove it.

const preview = (apiKey: string) =>
  `${apiKey.slice(0, 10)}…${apiKey.slice(-5)}`;

const openSiteKeyPage = async (page: Page, state: RunState) => {
  const app = state.apps[0];
  await declareApiKey(page, app.url, state.apiKey);
  await page.goto(app.url);
  await expect(page.locator(TITLE)).toBeVisible({ timeout: 60_000 });
  return app;
};

const expectSiteKeyScreen = async (
  popup: Page,
  state: RunState,
  projectName: string
) => {
  const host = new URL(state.tolgeeUrl).host;
  await expect(popup.getByTestId('connected-panel')).toContainText(
    'API key connection'
  );
  await expect(popup.getByTestId('connection-summary')).toHaveText(
    `This site connects with an API key from its own code. Edits you make on this page are saved to ${projectName} in Tolgee.`
  );
  await expect(popup.getByTestId('account-name')).toHaveText(
    "API key from the site's code"
  );
  await expect(popup.getByTestId('account-detail')).toHaveText(
    `${preview(state.apiKey)} on ${host}`
  );
  await expect(popup.getByTestId('project-link')).toHaveText(projectName);
  await expect(popup.getByTestId('dev-mode-note')).toContainText(
    'Development setup'
  );
  await expect(popup.getByTestId('dev-mode-note')).toContainText(
    'Anyone who opens this site can use its API key.'
  );
  await expect(popup.getByTestId('editing-switch')).toHaveCount(0);
  await expect(popup.getByTestId('change-branch')).toHaveCount(0);
  await expect(popup.getByTestId('sign-out')).toHaveCount(0);
  await expect(popup.getByTestId('footer-note')).toHaveText(
    'Editing is on because the site turned it on.'
  );
  await expect(popup.getByTestId('override-site-key')).toHaveText(
    'Use another key'
  );
  await expect(popup.getByTestId('server-settings')).toHaveCount(0);
};

const expectOverrideScreen = async (
  popup: Page,
  state: RunState,
  projectName: string,
  ownKey: string
) => {
  const host = new URL(state.tolgeeUrl).host;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('connection-summary')).toHaveText(
    `You're connected with your own project API key, overriding the one in the site's code. Edits you make on this page are saved to ${projectName} in Tolgee.`
  );
  await expect(popup.getByTestId('account-name')).toHaveText('Project API key');
  await expect(popup.getByTestId('account-detail')).toHaveText(
    `${preview(ownKey)} on ${host}`
  );
  await expect(popup.getByTestId('dev-mode-note')).toHaveCount(0);
  await expect(popup.getByTestId('override-site-key')).toHaveCount(0);
  // The site's own key keeps the page editable, so an editing switch could only lie about it.
  await expect(popup.getByTestId('editing-switch')).toHaveCount(0);
  await expect(popup.getByTestId('sign-out')).toHaveText("Back to site's key");
};

const keyUsedByPage = async (page: Page): Promise<string | undefined> => {
  const requests = collectProjectRequests(page);
  await openInContextDialog(page);
  await page.keyboard.press('Escape');
  expect(requests.length).toBeGreaterThan(0);
  return requests[0].headers()['x-api-key'];
};

const keyUsedByWorker = async (
  context: BrowserContext,
  page: Page
): Promise<string | undefined> => {
  const pageRequests = collectProjectRequests(page);
  const workerRequests = collectWorkerProjectRequests(context);
  await openInContextDialog(page);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => workerRequests.length, {
      message: 'the worker to send the dialog requests',
    })
    .toBeGreaterThan(0);
  expect(pageRequests).toEqual([]);
  return (await workerRequests[0].allHeaders())['x-api-key'];
};

const overrideWith = async (popup: Page, page: Page, ownKey: string) => {
  await popup.getByTestId('override-site-key').click();
  await expect(popup.getByTestId('sign-in-screen')).toContainText(
    'API key connection'
  );
  await popup.getByTestId('api-key-input').fill(ownKey);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await reloaded;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
};

test('shows the key from the site code as a connection it can only override', async ({
  page,
  state,
  openPopup,
}) => {
  const app = await openSiteKeyPage(page, state);
  const host = new URL(state.tolgeeUrl).host;
  const popup = await openPopup(page);

  await expectSiteKeyScreen(popup, state, app.projectName);
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  expect(await keyUsedByPage(page)).toBe(state.apiKey);

  await popup.getByTestId('override-site-key').click();
  await expect(popup.getByTestId('sign-in-screen')).toContainText(
    'API key connection'
  );
  await expect(popup.getByTestId('api-key-input')).toHaveValue('');
  await expect(popup.getByTestId('server-host')).toHaveText(host);
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
});

test('overrides the site key, keeps the override on a fresh popup and goes back to the site key', async ({
  page,
  context,
  state,
  openPopup,
}) => {
  const app = await openSiteKeyPage(page, state);
  const api = await apiAs(state);
  const ownKey = await api.createApiKeyWithId(app.projectId);
  try {
    let popup = await openPopup(page);
    await overrideWith(popup, page, ownKey.key);
    await expectOverrideScreen(popup, state, app.projectName, ownKey.key);
    expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
    expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');
    expect(await keyUsedByWorker(context, page)).toBe(ownKey.key);

    await popup.close();
    popup = await openPopup(page);
    await expectOverrideScreen(popup, state, app.projectName, ownKey.key);

    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('sign-out').click();
    await reloaded;
    await expectSiteKeyScreen(popup, state, app.projectName);
    expect(await sessionItem(page, '__tolgee_session')).toBeNull();

    await popup.close();
    popup = await openPopup(page);
    await expectSiteKeyScreen(popup, state, app.projectName);
    expect(await dialogAsksToSignIn(page)).toBe(false);
    expect(await keyUsedByPage(page)).toBe(state.apiKey);
  } finally {
    await api.deleteApiKey(ownKey.id).catch(() => undefined);
  }
});

test('signing in with a Tolgee account over the site key and signing out hands the page back to its own key', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  test.skip(!state.oauth.available, state.oauth.reason);
  const app = await openSiteKeyPage(page, state);
  const host = new URL(state.tolgeeUrl).host;
  const popup = await openPopup(page);
  await popup.getByTestId('override-site-key').click();
  await popup.getByTestId('all-connection-options').click();
  await signInThroughPopup({
    popup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });
  await expect(popup.getByTestId('account-detail')).toHaveText(
    `Signed in on ${host}`
  );
  expect(await sessionItem(page, '__tolgee_session')).toBe('oauth');

  const pageRequests = collectProjectRequests(page);
  const workerRequests = collectWorkerRequests(context);
  await openInContextDialog(page);
  await expect
    .poll(() => workerRequests.length, {
      message: 'the worker to send the dialog requests',
    })
    .toBeGreaterThan(0);
  await Promise.all(workerRequests.map((request) => request.response()));
  expect(pageRequests).toEqual([]);
  for (const request of workerRequests) {
    const headers = await request.allHeaders();
    expect(headers['authorization'], request.url()).toMatch(/^Bearer /);
    expect(headers['x-api-key'], request.url()).toBeUndefined();
  }
  await page.keyboard.press('Escape');

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('sign-out').click();
  await reloaded;
  await expectSiteKeyScreen(popup, state, app.projectName);
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
  expect(await dialogAsksToSignIn(page)).toBe(false);
  expect(await keyUsedByPage(page)).toBe(state.apiKey);
});
