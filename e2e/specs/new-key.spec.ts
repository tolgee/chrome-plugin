import { apiAs } from '../fixtures/api';
import { expect, type Page, test } from '../fixtures/extension';
import { signInThroughPopup } from '../fixtures/oauth';
import { IN_CONTEXT_DIALOG_TEXT, openTestapp } from '../fixtures/testapp';
import type { TolgeeApi } from '../setup/seed';
import type { RunState } from '../setup/state';

// The testapp renders this key but the seed never imports it, so its dialog opens for a key the project lacks.
const MISSING_KEY = 'share-button';
const MISSING_KEY_ELEMENT = '.items__buttons button:first-child';
const DEV_TOOLS = '#__tolgee_dev_tools';

const dialogTitle = (page: Page) =>
  page.locator(DEV_TOOLS).getByText(IN_CONTEXT_DIALOG_TEXT);

const connectWithApiKey = async (popup: Page, page: Page, apiKey: string) => {
  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(apiKey);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await reloaded;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
};

/** Alt+clicks the missing key's element, types an English translation and saves; the dialog closes on success. */
const createKeyFromDialog = async (page: Page, text: string) => {
  await page.locator(MISSING_KEY_ELEMENT).click({ modifiers: ['Alt'] });
  await expect(dialogTitle(page)).toBeVisible({ timeout: 30_000 });

  const submit = page.locator(DEV_TOOLS).locator('[data-cy="key-form-submit"]');
  await expect(submit).toBeEnabled();
  await expect(page.locator(DEV_TOOLS).locator('[role="alert"]')).toHaveCount(
    0
  );
  await page
    .locator(DEV_TOOLS)
    .locator(
      '[data-cy="translation-editor"][data-cy-language="en"] .cm-content'
    )
    .click();
  // The editor is prefilled with the element's default text.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await submit.click();
  await expect(dialogTitle(page)).toBeHidden();
};

let api: TolgeeApi;

const removeMissingKey = async (state: RunState) => {
  const projectId = state.apps[0].projectId;
  const keyId = await api.findKeyId(projectId, MISSING_KEY);
  if (keyId !== null) {
    await api.deleteKeys(projectId, [keyId]);
  }
};

test.beforeEach(async ({ state }) => {
  api = await apiAs(state);
  await removeMissingKey(state);
});

test.afterEach(async ({ state }) => {
  await removeMissingKey(state);
});

const expectKeyCreated = async (
  page: Page,
  projectId: number,
  text: string
) => {
  const key = await api.findKey(projectId, MISSING_KEY);
  expect(key, `key ${MISSING_KEY} exists after the save`).not.toBeNull();
  expect(key!.translations.en.text).toBe(text);
  await expect(page.locator(MISSING_KEY_ELEMENT)).toHaveText(text);
};

test('creates a key the project lacks from the dialog with an API key', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);

  await createKeyFromDialog(page, 'Share with a key');
  await expectKeyCreated(page, app.projectId, 'Share with a key');
});

test('creates a key the project lacks from the dialog with an OAuth session', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  test.skip(!state.oauth.available, state.oauth.reason);
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await signInThroughPopup({
    popup,
    context,
    worker,
    extensionId,
    tolgeeUrl: state.tolgeeUrl,
    user: state.user,
    target: page,
  });

  await createKeyFromDialog(page, 'Share with OAuth');
  await expectKeyCreated(page, app.projectId, 'Share with OAuth');
});
