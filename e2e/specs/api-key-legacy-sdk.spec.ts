import { apiAs } from '../fixtures/api';
import type { Request } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { collectPageRequests, collectWorkerRequests } from '../fixtures/oauth';
import {
  dialogAsksToSignIn,
  dialogSaysEditingOff,
  IN_CONTEXT_DIALOG_TEXT,
  openInContextDialog,
  openTestapp,
  pretendOldSdk,
  sessionItem,
  TITLE,
} from '../fixtures/testapp';

// The key behind the testapp's title (see importKeys in setup/seed.ts) and its seeded translation.
const KEY_NAME = 'app-title';
const ORIGINAL_TITLE = 'What To Pack';
const DEV_TOOLS = '#__tolgee_dev_tools';
const EDITED_TITLE = 'Packed by an old SDK';

const projectRequests = (requests: Request[]) =>
  requests.filter((request) => request.url().includes('/v2/projects'));

// An SDK from before the proxied-request protocol cannot send its requests through the extension, so a key entered
// in the popup is handed to the page instead and the SDK uses it as it always did.
test('connects an SDK without proxy support with an API key the page uses directly', async ({
  page,
  context,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const api = await apiAs(state);
  const pageRequests = collectPageRequests(page);
  const workerRequests = collectWorkerRequests(context);
  await pretendOldSdk(page);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);

  try {
    await test.step('the sign-in screen refuses to sign in but offers the key', async () => {
      await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
      await expect(popup.getByTestId('sdk-too-old')).toContainText(
        'Sign-in needs a newer Tolgee SDK'
      );
      await expect(popup.getByTestId('connect-oauth')).toHaveCount(0);
      await popup.getByTestId('use-api-key').click();
      await expect(popup.getByTestId('sdk-too-old')).toHaveCount(0);
      await popup.getByTestId('api-key-input').fill(state.apiKey);
      await expect(popup.getByTestId('api-key-valid')).toContainText(
        `Key works for ${app.projectName}`
      );
    });

    await test.step('connecting hands the key to the page', async () => {
      const reloaded = page.waitForEvent('load');
      await popup.getByTestId('connect-with-api-key').click();
      await reloaded;
      await expect(popup.getByTestId('connected-panel')).toBeVisible();
      await expect(popup.getByTestId('connection-summary')).toHaveText(
        `You're connected with a project API key. This site's SDK uses it directly; update @tolgee/web to keep it in the extension. Edits you make on this page are saved to ${app.projectName} in Tolgee.`
      );
      await expect(popup.getByTestId('sdk-too-old')).toHaveCount(0);
      await expect(popup.getByTestId('sign-out')).toHaveText('Remove key');
      const editingSwitch = popup
        .getByTestId('editing-switch')
        .locator('input');
      await expect(editingSwitch).toBeChecked();
      await expect(editingSwitch).toBeEnabled();

      expect(await sessionItem(page, '__tolgee_apiKey')).toBe(state.apiKey);
      expect(await sessionItem(page, '__tolgee_session')).toBeNull();
      expect(await sessionItem(page, '__tolgee_apiUrl')).toBe(state.tolgeeUrl);
      expect(await sessionItem(page, '__tolgee_projectId')).toBe(
        String(app.projectId)
      );
    });

    await test.step("the page's own requests carry the key and the worker sends none", async () => {
      await openInContextDialog(page);
      const submit = page
        .locator(DEV_TOOLS)
        .locator('[data-cy="key-form-submit"]');
      await expect(submit).toBeEnabled();
      await expect(
        page.locator(DEV_TOOLS).locator('[role="alert"]')
      ).toHaveCount(0);
      const fromPage = projectRequests(pageRequests);
      expect(fromPage.length).toBeGreaterThan(0);
      for (const request of fromPage) {
        expect((await request.allHeaders())['x-api-key'], request.url()).toBe(
          state.apiKey
        );
      }
      expect(projectRequests(workerRequests)).toEqual([]);

      await page
        .locator(DEV_TOOLS)
        .locator(
          '[data-cy="translation-editor"][data-cy-language="en"] .cm-content'
        )
        .click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(EDITED_TITLE);
      await submit.click();
      await expect(
        page.locator(DEV_TOOLS).getByText(IN_CONTEXT_DIALOG_TEXT)
      ).toBeHidden();
      expect(
        (await api.findKey(app.projectId, KEY_NAME))?.translations.en.text
      ).toBe(EDITED_TITLE);
      await expect(page.locator(TITLE)).toHaveText(EDITED_TITLE);
      expect(projectRequests(workerRequests)).toEqual([]);
    });

    await test.step('a reopened popup shows the connection the same way', async () => {
      await popup.reload();
      await expect(popup.getByTestId('connected-panel')).toBeVisible();
      await expect(popup.getByTestId('connection-summary')).toContainText(
        "This site's SDK uses it directly"
      );
      await expect(popup.getByTestId('account-name')).toHaveText(
        'Project API key'
      );
      await expect(popup.getByTestId('project-link')).toHaveText(
        app.projectName
      );
      await expect(popup.getByTestId('sdk-too-old')).toHaveCount(0);
      await expect(
        popup.getByTestId('editing-switch').locator('input')
      ).toBeChecked();
      await expect(popup.getByTestId('sign-out')).toHaveText('Remove key');
    });

    await test.step('Remove key clears the page slot', async () => {
      const reloaded = page.waitForEvent('load');
      await popup.getByTestId('sign-out').click();
      await reloaded;
      await expect(popup.getByTestId('sign-in-screen')).toBeVisible({
        timeout: 30_000,
      });
      // The popup stays on the API-key screen it was connected from, with an empty field.
      await expect(popup.getByTestId('api-key-input')).toHaveValue('');
      await expect(popup.getByTestId('sdk-too-old')).toHaveCount(0);
      await popup.getByTestId('all-connection-options').click();
      await expect(popup.getByTestId('sdk-too-old')).toBeVisible();
      await expect(popup.getByTestId('use-api-key')).toBeVisible();
      expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
      expect(await sessionItem(page, '__tolgee_apiUrl')).toBeNull();
      expect(await dialogAsksToSignIn(page)).toBe(true);
    });
  } finally {
    await api
      .setTranslations(app.projectId, KEY_NAME, { en: ORIGINAL_TITLE })
      .catch(() => undefined);
  }
});

// The editing switch takes the key out of the page and puts it back, the way it does for a proxied session.
test('turns editing off and on again for a key the page uses directly', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await pretendOldSdk(page);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(state.apiKey);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
  const connected = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await connected;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
  const editingSwitch = popup.getByTestId('editing-switch').locator('input');

  const reloadedOff = page.waitForEvent('load');
  await editingSwitch.click();
  await reloadedOff;
  await expect(editingSwitch).not.toBeChecked();
  await expect(popup.getByTestId('connection-summary')).toContainText(
    "This site's SDK uses it directly"
  );
  await expect(popup.getByTestId('sdk-too-old')).toHaveCount(0);
  expect(await sessionItem(page, '__tolgee_apiKey')).toBeNull();
  expect(await sessionItem(page, '__tolgee_apiUrl')).toBeNull();
  // The switch is marked in the page either way; an SDK from before the slot existed keeps asking to sign in instead.
  expect(await sessionItem(page, '__tolgee_editing')).toBe('off');
  expect(await dialogSaysEditingOff(page)).toBe(true);

  const reloadedOn = page.waitForEvent('load');
  await editingSwitch.click();
  await reloadedOn;
  await expect(editingSwitch).toBeChecked();
  expect(await sessionItem(page, '__tolgee_apiKey')).toBe(state.apiKey);
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
  expect(await sessionItem(page, '__tolgee_editing')).toBeNull();
  expect(await dialogAsksToSignIn(page)).toBe(false);
});
