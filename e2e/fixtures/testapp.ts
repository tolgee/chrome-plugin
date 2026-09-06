import type { BrowserContext, Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';

export const TITLE = '.header__title';

export const openTestapp = async (page: Page, url: string) => {
  await page.goto(url);
  await expect(page.locator(TITLE)).toBeVisible();
};

/** Collects the page's own calls to the Tolgee project API (CORS preflights carry no credentials and are ignored). */
export const collectProjectRequests = (page: Page): Request[] => {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes('/v2/projects') &&
      request.method() !== 'OPTIONS'
    ) {
      requests.push(request);
    }
  });
  return requests;
};

// See collectWorkerRequests in fixtures/oauth.ts for the PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS requirement.
export const collectWorkerProjectRequests = (
  context: BrowserContext
): Request[] => {
  const requests: Request[] = [];
  context.on('request', (request) => {
    if (
      request.serviceWorker() &&
      request.url().includes('/v2/projects') &&
      request.method() !== 'OPTIONS'
    ) {
      requests.push(request);
    }
  });
  return requests;
};

export const connectWithApiKey = async (
  popup: Page,
  page: Page,
  apiKey: string
) => {
  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(apiKey);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await reloaded;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
};

export const DEV_TOOLS = '#__tolgee_dev_tools';
// The dialog's alert for a page holding no credential (the SDK's api_key_not_specified).
export const SIGN_IN_ALERT_TEXT = 'Sign in to make changes';

export const keyFormSubmit = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="key-form-submit"]');

export const dialogAlert = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[role="alert"]');

const charLimitCheckbox = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="key-char-limit-checkbox"]');

export const screenshotFileInput = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="screenshot-file-input"]');

export const translationEditor = (page: Page, language = 'en') =>
  page
    .locator(DEV_TOOLS)
    .locator(
      `[data-cy="translation-editor"][data-cy-language="${language}"] .cm-content`
    );

export const openInContextDialog = async (
  page: Page,
  trigger = page.locator(TITLE)
) => {
  await trigger.click({ modifiers: ['Alt'] });
  await expect(keyFormSubmit(page)).toBeVisible({ timeout: 30_000 });
};

// Selects all first: the editor opens prefilled with the key's current text.
export const typeAndSubmitDialog = async (page: Page, text: string) => {
  await translationEditor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await keyFormSubmit(page).click();
  await expect(keyFormSubmit(page)).toBeHidden();
};

// The dialog's alert while the user has switched editing off for the page in the popup (the SDK's
// extension_editing_off).
export const EDITING_OFF_ALERT_TEXT = 'In-context editing is switched off';

// The SDK renders one alert body for several error codes (ErrorAlert.tsx groups all the signed-out ones), so a
// test that matches the copy cannot tell which code produced it: locate the code itself.
export const errorAlert = (page: Page, code: string) =>
  page
    .locator(DEV_TOOLS)
    .locator(`[data-cy="error-alert"][data-cy-error-code="${code}"]`);

export const signInAlert = (page: Page) =>
  errorAlert(page, 'api_key_not_specified');

export const editingOffAlert = (page: Page) =>
  errorAlert(page, 'extension_editing_off');

type DialogState = 'asks-to-sign-in' | 'editing-off' | 'editable';

const dialogState = async (page: Page): Promise<DialogState> => {
  await openInContextDialog(page);
  // Settles once the check behind the dialog has answered: either an alert renders, or the char-limit checkbox
  // does, which the SDK only renders once the form is ready (KeyForm's `ready && permissions.canEditCharLimit`).
  await expect
    .poll(
      async () =>
        (await signInAlert(page).count()) +
        (await editingOffAlert(page).count()) +
        (await charLimitCheckbox(page).count()),
      { timeout: 30_000, message: 'the dialog to settle on a state' }
    )
    .toBeGreaterThan(0);
  const state: DialogState =
    (await signInAlert(page).count()) > 0
      ? 'asks-to-sign-in'
      : (await editingOffAlert(page).count()) > 0
        ? 'editing-off'
        : 'editable';
  await page.keyboard.press('Escape');
  return state;
};

export const dialogAsksToSignIn = async (page: Page): Promise<boolean> =>
  (await dialogState(page)) === 'asks-to-sign-in';

export const dialogSaysEditingOff = async (page: Page): Promise<boolean> => {
  if ((await dialogState(page)) !== 'editing-off') {
    return false;
  }
  await openInContextDialog(page);
  await expect(editingOffAlert(page)).toContainText(
    'You switched editing off for this page in the Tolgee plugin. Turn it on to edit here.'
  );
  await expect(editingOffAlert(page)).not.toContainText(SIGN_IN_ALERT_TEXT);
  await page.keyboard.press('Escape');
  return true;
};

export const editingSwitchInput = (popup: Page) =>
  popup.getByTestId('editing-switch-input');

export const takeScreenshotButton = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="screenshot-take"]');

export const addImageButton = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="screenshot-add"]');

export const galleryThumbnails = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="screenshot-thumbnail"]');

export const sessionItem = (page: Page, key: string) =>
  page.evaluate((k) => sessionStorage.getItem(k), key);

const APP_MODULE = '/src/App.tsx';

// Vite inlines the testapp's env as `import.meta.env = {...}` at the top of App.tsx, so the page's Tolgee config can be
// changed per test by rewriting that literal on the way to the browser.
const rewriteAppEnv = (
  page: Page,
  appUrl: string,
  name: string,
  value: string
) =>
  page.route(`${appUrl}${APP_MODULE}*`, async (route) => {
    // A reload revalidates the module; vite's 304 would carry no body to rewrite.
    const headers = Object.fromEntries(
      Object.entries(route.request().headers()).filter(
        ([name]) => !['if-none-match', 'if-modified-since'].includes(name)
      )
    );
    const response = await route.fetch({ headers });
    const body = (await response.text()).replace(
      new RegExp(`"${name}": "[^"]*"`),
      `"${name}": ${JSON.stringify(value)}`
    );
    await route.fulfill({ response, body });
  });

/** Makes the testapp declare another project id (or none at all with an empty string). */
export const declareProject = (
  page: Page,
  appUrl: string,
  projectId: number | ''
) =>
  rewriteAppEnv(page, appUrl, 'VITE_APP_TOLGEE_PROJECT_ID', String(projectId));

/** Makes the testapp ship an API key in its own Tolgee config, i.e. run in the SDK's development mode. */
export const declareApiKey = (page: Page, appUrl: string, apiKey: string) =>
  rewriteAppEnv(page, appUrl, 'VITE_APP_TOLGEE_API_KEY', apiKey);

/** Serves a page of our own on the testapp's origin, where the content script runs as on any http(s) page. */
export const servePage = (page: Page, url: string, html: string) =>
  page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html', body: html })
  );

export const PLAIN_PAGE_HTML =
  '<!doctype html><title>plain</title><p>No Tolgee here.</p>';

/** Responses of the page's own project API calls, once they are in. */
export const responseStatuses = (requests: Request[]) =>
  Promise.all(requests.map(async (r) => (await r.response())?.status()));
