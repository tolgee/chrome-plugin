import { expect, test } from '../fixtures/extension';
import {
  collectProjectRequests,
  openInContextDialog,
  openTestapp,
  sessionItem,
} from '../fixtures/testapp';

test('connects with an API key, edits in context and removes the key', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const host = new URL(state.tolgeeUrl).host;
  await openTestapp(page, app.url);
  const popup = await openPopup(page);

  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('api-key-check')).toHaveText(app.projectName);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('account-name')).toHaveText('Project API key');
  await expect(popup.getByTestId('account-detail')).toContainText(host);
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await expect(
    popup.getByTestId('editing-switch').locator('input')
  ).toBeChecked();
  expect(await sessionItem(page, '__tolgee_apiKey')).toBe(state.apiKey);

  const requests = collectProjectRequests(page);
  await openInContextDialog(page);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.headers()['x-api-key'], request.url()).toBe(state.apiKey);
  }

  const reloadedAgain = page.waitForEvent('load');
  await popup.getByTestId('sign-out').click();
  await reloadedAgain;

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible({
    timeout: 30_000,
  });
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
});
