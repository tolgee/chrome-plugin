import { apiAs } from '../fixtures/api';
import { expect, test } from '../fixtures/extension';
import { collectWorkerRequests } from '../fixtures/oauth';
import {
  connectWithApiKey,
  IN_CONTEXT_DIALOG_TEXT,
  openInContextDialog,
  openTestapp,
  sessionItem,
  TITLE,
} from '../fixtures/testapp';

// The key behind the testapp's title (see importKeys in setup/seed.ts) and its seeded translation.
const KEY_NAME = 'app-title';
const ORIGINAL_TITLE = 'What To Pack';
const DEV_TOOLS = '#__tolgee_dev_tools';

// A project API key belongs to one project; a page declaring another one is edited in the key's project, not in
// the declared one, on every request the dialog makes.
test("a key for another project than the page declares connects to, and edits in, the key's project", async ({
  page,
  context,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
  const api = await apiAs(state);
  const key = await api.createApiKeyWithId(other.projectId);
  try {
    await openTestapp(page, app.url);
    const popup = await openPopup(page);
    await popup.getByTestId('use-api-key').click();
    await popup.getByTestId('api-key-input').fill(key.key);
    await expect(popup.getByTestId('api-key-valid')).toContainText(
      `Key works for ${other.projectName}`
    );
    await popup.getByTestId('all-connection-options').click();
    await connectWithApiKey(popup, page, key.key);

    await expect(popup.getByTestId('project-link')).toHaveText(
      other.projectName
    );
    await expect(popup.getByTestId('project-link')).toHaveAttribute(
      'href',
      `${state.tolgeeUrl}/projects/${other.projectId}`
    );
    await expect(popup.getByTestId('connection-summary')).toContainText(
      `saved to ${other.projectName} in Tolgee.`
    );
    expect(await sessionItem(page, '__tolgee_projectId')).toBe(
      String(other.projectId)
    );

    const workerRequests = collectWorkerRequests(context);
    await openInContextDialog(page);
    const submit = page
      .locator(DEV_TOOLS)
      .locator('[data-cy="key-form-submit"]');
    await expect(submit).toBeEnabled();
    await expect(page.locator(DEV_TOOLS).locator('[role="alert"]')).toHaveCount(
      0
    );
    await Promise.all(workerRequests.map((request) => request.response()));
    expect(workerRequests.length).toBeGreaterThan(0);
    // The declared project's id appears in no request, and none is refused as unknown (the 404 a request to the
    // declared project got); /branches/find answers 400 on any project without branching and is not a refusal.
    for (const request of workerRequests) {
      expect(request.url(), request.url()).not.toContain(
        `/v2/projects/${app.projectId}/`
      );
      expect((await request.response())?.status(), request.url()).not.toBe(404);
    }
    const permissions = workerRequests.find((request) =>
      request.url().includes('/v2/api-keys/current-permissions')
    );
    expect(permissions?.url()).toContain(`projectId=${other.projectId}`);
    expect((await permissions!.response())?.status()).toBe(200);
    const translations = workerRequests.find((request) =>
      request.url().includes(`/v2/projects/${other.projectId}/translations`)
    );
    expect((await translations!.response())?.status()).toBe(200);

    await page
      .locator(DEV_TOOLS)
      .locator(
        '[data-cy="translation-editor"][data-cy-language="en"] .cm-content'
      )
      .click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Packed for the other project');
    await submit.click();
    await expect(
      page.locator(DEV_TOOLS).getByText(IN_CONTEXT_DIALOG_TEXT)
    ).toBeHidden();

    const saved = await api.findKey(other.projectId, KEY_NAME);
    expect(saved?.translations.en.text).toBe('Packed for the other project');
    expect(
      (await api.findKey(app.projectId, KEY_NAME))?.translations.en.text
    ).toBe(ORIGINAL_TITLE);
    await expect(page.locator(TITLE)).toHaveText(
      'Packed for the other project'
    );
  } finally {
    await api
      .setTranslations(other.projectId, KEY_NAME, { en: ORIGINAL_TITLE })
      .catch(() => undefined);
    await api.deleteApiKey(key.id).catch(() => undefined);
  }
});
