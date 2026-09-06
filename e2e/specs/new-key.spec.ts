import { apiAs } from '../fixtures/api';
import { expect, type Page, test } from '../fixtures/extension';
import { signInThroughPopup } from '../fixtures/oauth';
import {
  connectWithApiKey,
  dialogAlert,
  keyFormSubmit,
  openInContextDialog,
  openTestapp,
  typeAndSubmitDialog,
} from '../fixtures/testapp';
import type { TolgeeApi } from '../setup/seed';
import type { RunState } from '../setup/state';

// The testapp renders this key but the seed never imports it, so its dialog opens for a key the project lacks.
const MISSING_KEY = 'share-button';
const MISSING_KEY_ELEMENT = '.items__buttons button:first-child';

const createKeyFromDialog = async (page: Page, text: string) => {
  await openInContextDialog(page, page.locator(MISSING_KEY_ELEMENT));
  await expect(keyFormSubmit(page)).toBeEnabled();
  await expect(dialogAlert(page)).toHaveCount(0);
  await typeAndSubmitDialog(page, text);
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
