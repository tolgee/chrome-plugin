import { expect, test } from '../fixtures/extension';
import {
  declareApiKey,
  openTestapp,
  sessionItem,
  TITLE,
} from '../fixtures/testapp';

const UNREACHABLE_SERVER = 'http://localhost:1';
const FOREIGN_KEY = 'tgpak_gezdgnrqguzdknrwgm2tmzlfgu4dcnjyg5tdcmrwguytmyjqgy';

test('keeps Connect disabled until a key is typed', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await expect(popup.getByTestId('api-key-input')).toHaveValue('');
  await expect(popup.getByTestId('server-input')).toHaveValue(state.tolgeeUrl);
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
  await expect(popup.getByTestId('api-key-check')).toHaveText(
    'Where can I get an API key?'
  );
  await expect(popup.getByTestId('api-key-invalid')).toHaveCount(0);
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
  await expect(popup.getByTestId('api-key-check')).toHaveText('');
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();

  // Enter must not submit an invalid key.
  await popup.getByTestId('api-key-input').press('Enter');
  await page.waitForTimeout(1_000);
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();

  // A shorter garbage value is rejected the same way.
  await popup.getByTestId('api-key-input').fill('nonsense');
  await expect(popup.getByTestId('api-key-invalid')).toBeVisible();
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
});

test('reports a server it cannot reach', async ({ page, state, openPopup }) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();

  await popup.getByTestId('server-input').fill(UNREACHABLE_SERVER);
  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('api-key-check')).toHaveText(
    'Could not reach the server'
  );
  await expect(popup.getByTestId('api-key-invalid')).toHaveCount(0);
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();

  // Back on the real server the same key checks out.
  await popup.getByTestId('server-input').fill(state.tolgeeUrl);
  await expect(popup.getByTestId('api-key-check')).toHaveText(
    state.apps[0].projectName
  );
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
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
  await expect(popup.getByTestId('api-key-check')).toHaveText(app.projectName);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('api-key-input').press('Enter');
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  expect(await sessionItem(page, '__tolgee_apiKey')).toBe(state.apiKey);
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

test('shows the development-mode note when the page config carries the key itself', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await declareApiKey(page, app.url, state.apiKey);
  await page.goto(app.url);
  await expect(page.locator(TITLE)).toBeVisible({ timeout: 60_000 });
  const popup = await openPopup(page);

  // The key is already in use by the page, so the popup opens on the API-key screen with nothing to connect.
  await expect(popup.getByTestId('sign-in-screen')).toContainText(
    'API key connection'
  );
  await expect(popup.getByTestId('api-key-input')).toHaveValue(state.apiKey);
  await expect(popup.getByTestId('api-key-check')).toHaveText(app.projectName);
  await expect(popup.getByTestId('dev-mode-note')).toContainText(
    'Api key is included directly in Tolgee configuration'
  );
  await expect(popup.getByTestId('connect-with-api-key')).toBeDisabled();
});
