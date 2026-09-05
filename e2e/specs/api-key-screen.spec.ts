import { apiAs } from '../fixtures/api';
import { expect, test } from '../fixtures/extension';
import { openTestapp, sessionItem } from '../fixtures/testapp';

const UNREACHABLE_SERVER = 'http://localhost:1';
const FOREIGN_KEY = 'tgpak_gezdgnrqguzdknrwgm2tmzlfgu4dcnjyg5tdcmrwguytmyjqgy';
const VIEW_ONLY_SCOPES = ['translations.view', 'keys.view'];

const preview = (apiKey: string) =>
  `${apiKey.slice(0, 10)}…${apiKey.slice(-5)}`;

test('keeps Connect disabled until a key is typed', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await expect(popup.getByTestId('sign-in-screen')).toContainText(
    `Connect to ${new URL(state.tolgeeUrl).host} with a project API key`
  );
  await expect(popup.getByTestId('api-key-input')).toHaveValue('');
  await expect(popup.getByTestId('server-input')).toHaveCount(0);
  await expect(popup.getByTestId('connect-with-api-key')).toHaveText('Connect');
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
  await expect(popup.getByTestId('api-key-check')).toHaveText(
    'Where can I get an API key?'
  );
  await expect(popup.getByTestId('api-key-invalid')).toHaveCount(0);
  await expect(popup.getByTestId('api-key-valid')).toHaveCount(0);
});

test('shares the server behind the gear with the sign-in screen', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await popup.getByTestId('server-settings').click();
  await expect(popup.getByTestId('server-input')).toHaveValue(state.tolgeeUrl);
  await expect(popup.getByTestId('server-helper')).toHaveText(
    'Change if you have your own instance of Tolgee.'
  );
  await popup.getByTestId('server-input').fill('https://my.tolgee.io');
  await expect(popup.getByTestId('server-host')).toHaveText('my.tolgee.io');
  await expect(popup.getByTestId('server-host')).toHaveAttribute(
    'href',
    'https://my.tolgee.io/'
  );

  await popup.getByTestId('server-settings').click();
  await expect(popup.getByTestId('server-input')).toHaveCount(0);
  await popup.getByTestId('all-connection-options').click();
  await expect(popup.getByTestId('server-host')).toHaveText('my.tolgee.io');
  await expect(popup.getByTestId('server-input')).toHaveCount(0);
});

test('rejects a key that does not belong to this server', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await popup.getByTestId('api-key-input').fill(FOREIGN_KEY);
  await expect(popup.getByTestId('api-key-invalid')).toContainText(
    `This API key doesn't work on ${new URL(state.tolgeeUrl).host}`
  );
  await expect(popup.getByTestId('api-key-check')).toHaveCount(0);
  await expect(popup.getByTestId('connect-with-api-key')).toHaveText('Connect');
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();

  // Enter must not submit an invalid key.
  await popup.getByTestId('api-key-input').press('Enter');
  await page.waitForTimeout(1_000);
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();

  await popup.getByTestId('api-key-input').fill('nonsense');
  await expect(popup.getByTestId('api-key-invalid')).toBeVisible();
  await expect(popup.getByTestId('api-key-input')).toHaveValue('nonsense');
  await expect(popup.getByTestId('api-key-input')).not.toHaveAttribute(
    'readonly',
    ''
  );
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
});

test('reports a server it cannot reach', async ({ page, state, openPopup }) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await popup.getByTestId('server-settings').click();
  await popup.getByTestId('server-input').fill(UNREACHABLE_SERVER);
  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('api-key-check')).toHaveText(
    'Could not reach localhost:1'
  );
  await expect(popup.getByTestId('api-key-invalid')).toHaveCount(0);
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();

  // Back on the real server the same key checks out.
  await popup.getByTestId('server-input').fill(state.tolgeeUrl);
  await expect(popup.getByTestId('api-key-valid')).toContainText(
    `Key works for ${app.projectName}`
  );
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
});

test('collapses a verified key into a preview and names the project', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('api-key-valid')).toHaveText(
    `Key works for ${app.projectName}`
  );
  await expect(popup.getByTestId('api-key-input')).toHaveValue(
    preview(state.apiKey)
  );
  await expect(popup.getByTestId('api-key-input')).toHaveAttribute(
    'readonly',
    ''
  );
  await expect(popup.getByTestId('toggle-api-key-visibility')).toHaveCount(0);
  await expect(popup.getByTestId('api-key-check')).toHaveCount(0);
  await expect(popup.getByTestId('connect-with-api-key')).toHaveText(
    `Connect to ${app.projectName}`
  );
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();

  await popup.getByTestId('use-another-key').click();
  await expect(popup.getByTestId('api-key-input')).toHaveValue('');
  await expect(popup.getByTestId('api-key-input')).not.toHaveAttribute(
    'readonly',
    ''
  );
  await expect(popup.getByTestId('api-key-valid')).toHaveCount(0);
  await expect(popup.getByTestId('api-key-check')).toHaveText(
    'Where can I get an API key?'
  );
  await expect(popup.getByTestId('connect-with-api-key')).toHaveText('Connect');
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
});

test('warns about a view-only key and connects with it', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const api = await apiAs(state);
  const viewOnly = await api.createApiKeyWithId(
    app.projectId,
    VIEW_ONLY_SCOPES
  );
  try {
    await openTestapp(page, app.url);
    const popup = await openPopup(page);
    await popup.getByTestId('use-api-key').click();

    await popup.getByTestId('api-key-input').fill(viewOnly.key);
    await expect(popup.getByTestId('api-key-view-only')).toContainText(
      'This key can only view strings'
    );
    await expect(popup.getByTestId('api-key-view-only')).toContainText(
      'You can look up strings on this page but not edit them.'
    );
    await expect(popup.getByTestId('api-key-valid')).toHaveCount(0);
    await expect(popup.getByTestId('api-key-input')).toHaveValue(
      preview(viewOnly.key)
    );
    await expect(popup.getByTestId('connect-with-api-key')).toHaveText(
      `Connect to ${app.projectName}`
    );
    await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();

    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('connect-with-api-key').click();
    await reloaded;

    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('connection-summary')).toHaveText(
      "You're connected with a view-only API key. You can look up strings on this page but not edit them."
    );
    await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
    expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
    expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');

    await popup.reload();
    await expect(popup.getByTestId('connection-summary')).toContainText(
      "You're connected with a view-only API key."
    );
    await expect(popup.getByTestId('sign-out')).toHaveText('Remove key');
  } finally {
    await api.deleteApiKey(viewOnly.id).catch(() => undefined);
  }
});

test('connects with Enter once the key is valid', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('api-key-valid')).toContainText(
    app.projectName
  );
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('api-key-input').press('Enter');
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');
});

test('masks the key and reveals it on demand', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();
  const input = popup.getByTestId('api-key-input');
  const toggle = popup.getByTestId('toggle-api-key-visibility');

  await input.fill('tgpak_secret');
  await expect(input).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-label', 'Show API key');

  await toggle.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('tgpak_secret');
  await expect(toggle).toHaveAttribute('aria-label', 'Hide API key');

  await toggle.click();
  await expect(input).toHaveAttribute('type', 'password');
});
