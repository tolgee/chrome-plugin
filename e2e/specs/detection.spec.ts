import { expect, test } from '../fixtures/extension';
import { openTestapp, TITLE } from '../fixtures/testapp';

test('shows the sign-in screen with the page project detected', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);

  const popup = await openPopup(page);

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('project-not-detected')).toHaveCount(0);
  await expect(popup.getByTestId('server-host')).toHaveText(
    new URL(state.tolgeeUrl).host
  );
});

// Regression: the popup used to give up on the page after 4 s without a content script and show "No access to
// this page" for good, even once the page came back. The content script (document_idle) only arrives after the
// parser has finished, so a parser-blocking script held for 6 s leaves the reloading tab without one long enough.
test('recovers when opened while the page is still reloading', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const HOLD_SCRIPT = '/__e2e_hold.js';
  await page.route(`${app.url}/`, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      '<head>',
      `<head><script src="${HOLD_SCRIPT}"></script>`
    );
    await route.fulfill({ response, body: html });
  });
  await page.route(`${app.url}${HOLD_SCRIPT}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });

  const reloaded = page.reload({ timeout: 60_000 });
  const popup = await openPopup(page);
  await expect(popup.getByTestId('popup-loading')).toBeVisible();

  await reloaded;
  await expect(page.locator(TITLE)).toBeVisible();
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('popup-error')).toHaveCount(0);
});
