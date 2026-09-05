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
  await expect(popup.getByTestId('server-settings')).toBeVisible();
  await expect(popup.getByTestId('server-input')).toHaveCount(0);
});

test('shows the page server and reveals the server field behind the gear', async ({
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
  await expect(popup.getByTestId('change-server')).toHaveCount(0);

  const gear = popup.getByTestId('server-settings');
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await gear.click();
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await expect(popup.getByTestId('server-input')).toHaveValue(state.tolgeeUrl);
  await expect(popup.getByTestId('server-helper')).toHaveText(
    'Change if you have your own instance of Tolgee.'
  );

  await gear.click();
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await expect(popup.getByTestId('server-input')).toHaveCount(0);
});

test('disables Connect while the server field holds no usable URL', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('server-settings').click();

  await popup.getByTestId('server-input').fill('not a url');
  await expect(popup.getByTestId('server-host')).toHaveText('not a url');
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();

  // The panel cannot be closed on a value the extension could not connect to.
  await popup.getByTestId('server-settings').click();
  await expect(popup.getByTestId('server-input')).toBeVisible();
  await expect(popup.getByTestId('server-settings')).toHaveAttribute(
    'aria-expanded',
    'true'
  );

  await popup.getByTestId('server-input').fill('app.tolgee.io');
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();

  await popup.getByTestId('server-input').fill('https://my.tolgee.io');
  await expect(popup.getByTestId('server-host')).toHaveText('my.tolgee.io');
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await popup.getByTestId('server-settings').click();
  await expect(popup.getByTestId('server-input')).toHaveCount(0);
  await popup.getByTestId('server-settings').click();

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
  await popup.getByTestId('server-settings').click();
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

test('keeps the typed API key and the server while switching between the connection screens', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);
  const popup = await openPopup(page);
  await popup.getByTestId('server-settings').click();
  await popup.getByTestId('server-input').fill(UNREACHABLE_SERVER);

  await popup.getByTestId('use-api-key').click();
  await expect(popup.getByTestId('sign-in-screen')).toContainText(
    'API key connection'
  );
  await expect(popup.getByTestId('server-input')).toHaveValue(
    UNREACHABLE_SERVER
  );
  await expect(popup.getByTestId('server-host')).toHaveText('localhost:1');
  await popup.getByTestId('api-key-input').fill('tgpak_typed-but-not-sent');
  await expect(popup.getByTestId('connect-oauth')).toHaveCount(0);

  await popup.getByTestId('all-connection-options').click();
  await expect(popup.getByTestId('connect-oauth')).toBeVisible();
  await expect(popup.getByTestId('api-key-input')).toHaveCount(0);
  await expect(popup.getByTestId('server-host')).toHaveText('localhost:1');

  await popup.getByTestId('use-api-key').click();
  await expect(popup.getByTestId('api-key-input')).toHaveValue(
    'tgpak_typed-but-not-sent'
  );
});
