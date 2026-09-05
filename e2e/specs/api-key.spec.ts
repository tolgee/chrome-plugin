import { expect, test } from '../fixtures/extension';
import {
  collectProjectRequests,
  collectWorkerProjectRequests,
  dialogAsksToSignIn,
  openInContextDialog,
  openTestapp,
  sessionItem,
} from '../fixtures/testapp';

test('connects with an API key, edits in context through the worker and removes the key', async ({
  page,
  context,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const host = new URL(state.tolgeeUrl).host;
  await openTestapp(page, app.url);
  const popup = await openPopup(page);

  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('api-key-valid')).toContainText(
    `Key works for ${app.projectName}`
  );
  await expect(popup.getByTestId('connect-with-api-key')).toHaveText(
    `Connect to ${app.projectName}`
  );

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await reloaded;

  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  await expect(popup.getByTestId('connection-summary')).toHaveText(
    `You're connected with a project API key. Edits you make on this page are saved to ${app.projectName} in Tolgee.`
  );
  await expect(popup.getByTestId('account-name')).toHaveText('Project API key');
  await expect(popup.getByTestId('account-detail')).toContainText(host);
  await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
  await expect(
    popup.getByTestId('editing-switch').locator('input')
  ).toBeChecked();
  // The page is told the kind of session and the project; the key stays in the worker.
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');
  expect(await sessionItem(page, '__tolgee_projectId')).toBe(
    String(app.projectId)
  );

  const pageRequests = collectProjectRequests(page);
  const workerRequests = collectWorkerProjectRequests(context);
  await openInContextDialog(page);
  await expect
    .poll(
      () =>
        workerRequests.some((request) =>
          request.url().includes(`/v2/projects/${app.projectId}/`)
        ),
      { message: 'the worker to send the dialog requests' }
    )
    .toBe(true);
  await Promise.all(workerRequests.map((request) => request.response()));
  expect(pageRequests).toEqual([]);
  for (const request of workerRequests) {
    const headers = await request.allHeaders();
    expect(headers['x-api-key'], request.url()).toBe(state.apiKey);
    expect(headers['authorization'], request.url()).toBeUndefined();
  }
  await page.keyboard.press('Escape');

  // A popup opened now must not take the connection for a key from the site's code.
  await popup.reload();
  await expect(popup.getByTestId('connection-summary')).toHaveText(
    `You're connected with a project API key. Edits you make on this page are saved to ${app.projectName} in Tolgee.`
  );
  await expect(popup.getByTestId('account-name')).toHaveText('Project API key');
  await expect(popup.getByTestId('sign-out')).toHaveText('Remove key');
  await expect(popup.getByTestId('dev-mode-note')).toHaveCount(0);

  const reloadedAgain = page.waitForEvent('load');
  await popup.getByTestId('sign-out').click();
  await reloadedAgain;

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible({
    timeout: 30_000,
  });
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
  // A page without a key of its own has nothing to edit with once the extension's key is gone.
  expect(await dialogAsksToSignIn(page)).toBe(true);
});
