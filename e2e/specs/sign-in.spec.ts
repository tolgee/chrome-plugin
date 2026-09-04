import { expect, test } from '../fixtures/extension';
import { declareProject, openTestapp } from '../fixtures/testapp';

const UNREACHABLE_SERVER = 'http://localhost:1';

test('offers no sign-in on a page that declares no project', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await declareProject(page, app.url, '');
  await openTestapp(page, app.url);
  const popup = await openPopup(page);

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await expect(popup.getByTestId('project-not-detected')).toContainText(
    'Sign-in not available on this site'
  );
  await expect(popup.getByTestId('project-not-detected')).toContainText(
    'set projectId in the Tolgee configuration'
  );
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();
  await expect(popup.getByTestId('use-api-key')).toBeEnabled();
  await expect(popup.getByTestId('change-server')).toHaveCount(0);
});

test('shows the page server and reveals the server field on Change server', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);

  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('server-host')).toHaveText(
    new URL(state.tolgeeUrl).host
  );
  await expect(popup.getByTestId('server-host')).toHaveAttribute(
    'href',
    `${state.tolgeeUrl}/`
  );
  await expect(popup.getByTestId('server-input')).toHaveCount(0);

  await popup.getByTestId('change-server').click();
  await expect(popup.getByTestId('server-input')).toHaveValue(state.tolgeeUrl);
  await expect(popup.getByTestId('server-helper')).toHaveText(
    'Change if you have your own instance of Tolgee.'
  );
  await expect(popup.getByTestId('change-server')).toHaveCount(0);
});

test('disables Connect while the server field holds no usable URL', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('change-server').click();

  await popup.getByTestId('server-input').fill('not a url');
  await expect(popup.getByTestId('server-host')).toHaveText('not a url');
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();

  await popup.getByTestId('server-input').fill('app.tolgee.io');
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();

  await popup.getByTestId('server-input').fill('https://my.tolgee.io');
  await expect(popup.getByTestId('server-host')).toHaveText('my.tolgee.io');
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();

  // Empty falls back to the default server.
  await popup.getByTestId('server-input').fill('');
  await expect(popup.getByTestId('server-host')).toHaveText('app.tolgee.io');
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
});

test('shows the connect error when the server cannot be reached', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('change-server').click();
  await popup.getByTestId('server-input').fill(UNREACHABLE_SERVER);
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();

  await popup.getByTestId('connect-oauth').click();
  // The identity flow retries the authorization page a few times before giving up.
  await expect(popup.getByTestId('connect-error')).toBeVisible({
    timeout: 60_000,
  });
  await expect(popup.getByTestId('connect-error')).not.toHaveText(/^Error:/);
  await expect(popup.getByTestId('connect-oauth')).toHaveText(
    'Connect to Tolgee'
  );
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
});

test('keeps the typed API key while switching between the connection screens', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);

  await popup.getByTestId('use-api-key').click();
  await expect(popup.getByTestId('sign-in-screen')).toContainText(
    'API key connection'
  );
  await popup.getByTestId('api-key-input').fill('tgpak_typed-but-not-sent');
  await expect(popup.getByTestId('connect-oauth')).toHaveCount(0);

  await popup.getByTestId('all-connection-options').click();
  await expect(popup.getByTestId('connect-oauth')).toBeVisible();
  await expect(popup.getByTestId('api-key-input')).toHaveCount(0);

  await popup.getByTestId('use-api-key').click();
  await expect(popup.getByTestId('api-key-input')).toHaveValue(
    'tgpak_typed-but-not-sent'
  );
});
