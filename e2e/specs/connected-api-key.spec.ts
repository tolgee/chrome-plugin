import { apiAs, apiKeyStatus } from '../fixtures/api';
import { expect, test, type Worker } from '../fixtures/extension';
import {
  connectWithApiKey,
  dialogAsksToSignIn,
  dialogSaysEditingOff,
  editingSwitchInput,
  openTestapp,
  sessionItem,
} from '../fixtures/testapp';

const originRecord = (worker: Worker, origin: string) =>
  worker.evaluate(
    (key) => chrome.storage.local.get(key).then((r: any) => r[key] ?? null),
    origin
  );

test('shows the connection and turns in-context editing off and on', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const host = new URL(state.tolgeeUrl).host;
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);

  await expect(popup.getByTestId('connected-panel')).toContainText(
    'API key connection'
  );
  await expect(popup.getByTestId('connection-summary')).toHaveText(
    `You're connected with a project API key. Edits you make on this page are saved to ${app.projectName} in Tolgee.`
  );
  await expect(popup.getByTestId('account-name')).toHaveText('Project API key');
  await expect(popup.getByTestId('account-detail')).toHaveText(
    `${state.apiKey.slice(0, 10)}…${state.apiKey.slice(-5)} on ${host}`
  );
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await expect(popup.getByTestId('project-link')).toHaveAttribute(
    'href',
    `${state.tolgeeUrl}/projects/${app.projectId}`
  );
  await expect(popup.getByTestId('project-link')).toHaveAttribute(
    'target',
    '_blank'
  );
  const editingSwitch = editingSwitchInput(popup);
  await expect(editingSwitch).toBeChecked();
  await expect(popup.getByTestId('editing-title')).toHaveText(
    'In-context editing on this page'
  );
  await expect(popup.getByTestId('editing-hint')).toHaveText(
    'Alt+click any text on the page to edit it.'
  );
  await expect(popup.getByTestId('sign-out')).toHaveText('Remove key');
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');
  expect(await sessionItem(page, '__tolgee_apiUrl')).toBe(state.tolgeeUrl);

  const reloadedOff = page.waitForEvent('load');
  await editingSwitch.click();
  await reloadedOff;
  await expect(editingSwitch).not.toBeChecked();
  await expect(popup.getByTestId('editing-title')).toHaveText(
    'In-context editing off on this page'
  );
  await expect(popup.getByTestId('editing-hint')).toHaveText(
    'You stay signed in. Turn it on to edit here.'
  );
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
  expect(await sessionItem(page, '__tolgee_apiUrl')).toBeNull();
  await test.step('alt+click still opens the dialog, which says editing is off rather than asking to sign in', async () => {
    expect(await sessionItem(page, '__tolgee_editing')).toBe('off');
    expect(await dialogSaysEditingOff(page)).toBe(true);
    expect(await dialogAsksToSignIn(page)).toBe(false);
  });

  const reloadedOn = page.waitForEvent('load');
  await editingSwitch.click();
  await reloadedOn;
  await expect(editingSwitch).toBeChecked();
  await expect(popup.getByTestId('editing-hint')).toHaveText(
    'Alt+click any text on the page to edit it.'
  );
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');
  expect(await sessionItem(page, '__tolgee_editing')).toBeNull();
  expect(await dialogAsksToSignIn(page)).toBe(false);
  expect(await dialogSaysEditingOff(page)).toBe(false);
});

// Regression: with editing already off there is no page reload to re-detect Tolgee, and the popup used to fall
// back to "This website doesn't seem to be using Tolgee" after Remove key.
test('removes the key while editing is off', async ({
  page,
  state,
  worker,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);
  expect(await originRecord(worker, app.url)).toMatchObject({
    apiKey: state.apiKey,
    apiUrl: state.tolgeeUrl,
    projectKey: String(app.projectId),
  });

  const editingSwitch = editingSwitchInput(popup);
  const reloaded = page.waitForEvent('load');
  await editingSwitch.click();
  await reloaded;
  await expect(editingSwitch).not.toBeChecked();
  expect(await sessionItem(page, '__tolgee_editing')).toBe('off');

  await popup.getByTestId('sign-out').click();
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await expect(popup.getByTestId('popup-not-present')).toHaveCount(0);
  await expect(popup.getByTestId('api-key-input')).toHaveValue('');
  await popup.getByTestId('server-settings').click();
  await expect(popup.getByTestId('server-input')).toHaveValue(state.tolgeeUrl);
  await expect.poll(() => originRecord(worker, app.url)).toBeNull();

  // Nothing else leaked through: the page still runs without credentials.
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  await test.step('with the key gone the dialog asks to sign in again, not that editing is off', async () => {
    await expect.poll(() => sessionItem(page, '__tolgee_editing')).toBeNull();
    expect(await dialogAsksToSignIn(page)).toBe(true);
  });
  await popup.getByTestId('all-connection-options').click();
  await expect(popup.getByTestId('server-host')).toHaveText(
    new URL(state.tolgeeUrl).host
  );
});

test('shows the rejected-key state once the key is revoked on the server', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const host = new URL(state.tolgeeUrl).host;
  const api = await apiAs(state);
  const ownKey = await api.createApiKeyWithId(app.projectId);
  try {
    await openTestapp(page, app.url);
    let popup = await openPopup(page);
    await connectWithApiKey(popup, page, ownKey.key);
    await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
    await popup.close();

    await api.deleteApiKey(ownKey.id);
    await expect
      .poll(() => apiKeyStatus(state.tolgeeUrl, ownKey.key))
      .not.toBe(200);

    popup = await openPopup(page);
    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('api-key-rejected')).toContainText(
      `This API key doesn't work on ${host}`
    );
    await expect(popup.getByTestId('api-key-rejected')).toContainText(
      "hasn't been revoked"
    );
    await expect(popup.getByTestId('account-name')).toHaveText(
      'Project API key'
    );
    await expect(popup.getByTestId('connection-summary')).toHaveCount(0);
    await expect(popup.getByTestId('project-link')).toHaveCount(0);
    await expect(popup.getByTestId('editing-switch')).toHaveCount(0);

    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('sign-out').click();
    await reloaded;
    await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
    expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  } finally {
    await api.deleteApiKey(ownKey.id).catch(() => undefined);
  }
});
