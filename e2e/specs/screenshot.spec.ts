import type { Request } from '@playwright/test';
import { apiAs } from '../fixtures/api';
import { expect, type Page, test, type Worker } from '../fixtures/extension';
import { signInThroughPopup } from '../fixtures/oauth';
import {
  IN_CONTEXT_DIALOG_TEXT,
  openInContextDialog,
  openTestapp,
} from '../fixtures/testapp';
import { API_KEY_SCOPES, type TolgeeApi } from '../setup/seed';
import type { RunState } from '../setup/state';

// The key behind the testapp's title (see importKeys in setup/seed.ts); the dialog opened by alt+clicking it.
const KEY_NAME = 'app-title';
const DEV_TOOLS = '#__tolgee_dev_tools';
const SCOPES_WITHOUT_UPLOAD = API_KEY_SCOPES.filter(
  (scope) => scope !== 'screenshots.upload' && scope !== 'screenshots.delete'
);

type Capture = { windowId: unknown; dataUrl: string };

/** Wraps `chrome.tabs.captureVisibleTab` in the worker, recording every call and what it produced. */
const spyOnCapture = (worker: Worker) =>
  worker.evaluate(() => {
    const original = chrome.tabs.captureVisibleTab;
    const captures: Capture[] = [];
    (globalThis as any).__e2eCaptures = captures;
    // webextension-polyfill looks the function up at call time and passes a callback as the last argument.
    chrome.tabs.captureVisibleTab = (...args: any[]) => {
      const record = (dataUrl: string) =>
        captures.push({ windowId: args[0], dataUrl: String(dataUrl) });
      const callbackIndex = args.findIndex((arg) => typeof arg === 'function');
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex];
        args[callbackIndex] = (dataUrl: string) => {
          record(dataUrl);
          callback(dataUrl);
        };
        return original.apply(chrome.tabs, args);
      }
      return original.apply(chrome.tabs, args).then((dataUrl: string) => {
        record(dataUrl);
        return dataUrl;
      });
    };
  });

const captures = (worker: Worker): Promise<Capture[]> =>
  worker.evaluate(() =>
    ((globalThis as any).__e2eCaptures ?? []).map((c: Capture) => ({
      windowId: c.windowId,
      dataUrl: c.dataUrl.slice(0, 40),
    }))
  );

/** Records what the content script hands back to the SDK for TOLGEE_TAKE_SCREENSHOT. */
const listenForScreenshotTaken = (page: Page) =>
  page.evaluate(() => {
    const taken: string[] = [];
    (window as any).__e2eScreenshotTaken = taken;
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'TOLGEE_SCREENSHOT_TAKEN') {
        taken.push(String(event.data.data).slice(0, 40));
      }
    });
  });

const screenshotsTaken = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as any).__e2eScreenshotTaken ?? []);

/** The page's uploads to `/v2/image-upload` (CORS preflights carry no credentials and are ignored). */
const collectUploads = (page: Page): Request[] => {
  const uploads: Request[] = [];
  page.on('request', (request) => {
    if (
      request.url().endsWith('/v2/image-upload') &&
      request.method() === 'POST'
    ) {
      uploads.push(request);
    }
  });
  return uploads;
};

// The MUI modal marks the dev-tools root aria-hidden, which hides its content from role queries; attribute selectors
// are used instead.
const takeScreenshotButton = (page: Page) =>
  page.locator(DEV_TOOLS).locator('button[aria-label="Take screenshot"]');

const addImageButton = (page: Page) =>
  page.locator(DEV_TOOLS).locator('button[aria-label="Add image"]');

const galleryThumbnails = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[aria-label="Screenshot"]');

const saveButton = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[data-cy="key-form-submit"]');

const dialogAlert = (page: Page) =>
  page.locator(DEV_TOOLS).locator('[role="alert"]');

const connectWithApiKey = async (popup: Page, page: Page, apiKey: string) => {
  await popup.getByTestId('use-api-key').click();
  await popup.getByTestId('api-key-input').fill(apiKey);
  await expect(popup.getByTestId('connect-with-api-key')).toBeEnabled();
  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('connect-with-api-key').click();
  await reloaded;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
};

type Credential = 'api-key' | 'oauth';

/** Takes one screenshot from the open dialog and checks every hop: worker capture, SDK message, upload, gallery. */
const takeScreenshotAndCheckHops = async (
  page: Page,
  worker: Worker,
  credential: Credential,
  apiKey?: string
) => {
  await spyOnCapture(worker);
  await listenForScreenshotTaken(page);
  const uploads = collectUploads(page);

  await takeScreenshotButton(page).click();
  await expect(galleryThumbnails(page)).toHaveCount(1);
  await expect(
    galleryThumbnails(page).locator('[data-cy="screenshot-image"]')
  ).toBeVisible();

  const captured = await captures(worker);
  expect(captured).toHaveLength(1);
  expect(typeof captured[0].windowId).toBe('number');
  expect(captured[0].dataUrl).toMatch(/^data:image\/(jpeg|png);base64,/);
  expect(await screenshotsTaken(page)).toEqual([captured[0].dataUrl]);

  expect(uploads).toHaveLength(1);
  const headers = await uploads[0].allHeaders();
  expect(headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  if (credential === 'api-key') {
    expect(headers['x-api-key']).toBe(apiKey);
    expect(headers['authorization']).toBeUndefined();
  } else {
    expect(headers['authorization']).toMatch(/^Bearer /);
    expect(headers['x-api-key']).toBeUndefined();
  }
  expect((await uploads[0].response())?.status()).toBe(201);
};

const dialogTitle = (page: Page) =>
  page.locator(DEV_TOOLS).getByText(IN_CONTEXT_DIALOG_TEXT);

/** Saves the dialog and returns the key's screenshots as the server lists them once the save went through. */
const saveAndReadScreenshots = async (
  page: Page,
  api: TolgeeApi,
  projectId: number
) => {
  await saveButton(page).click();
  // A successful save closes the dialog by itself; a failed one keeps it open with an alert.
  await expect(dialogTitle(page)).toBeHidden();
  const keyId = await api.findKeyId(projectId, KEY_NAME);
  expect(keyId, `key ${KEY_NAME} exists after the save`).not.toBeNull();
  return {
    keyId: keyId!,
    screenshots: await api.keyScreenshots(projectId, keyId!),
  };
};

let api: TolgeeApi;
const createdApiKeyIds: number[] = [];

const removeKeyScreenshots = async (state: RunState) => {
  const projectId = state.apps[0].projectId;
  const keyId = await api.findKeyId(projectId, KEY_NAME);
  if (keyId === null) {
    return;
  }
  const ids = (await api.keyScreenshots(projectId, keyId)).map((s) => s.id);
  if (ids.length) {
    await api.deleteKeyScreenshots(projectId, keyId, ids);
  }
};

test.beforeEach(async ({ state }) => {
  api = await apiAs(state);
});

test.afterEach(async ({ state }) => {
  await removeKeyScreenshots(state);
  for (const id of createdApiKeyIds.splice(0)) {
    await api.deleteApiKey(id);
  }
});

test('takes a screenshot with an API key and attaches it to the key', async ({
  page,
  worker,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);
  await openInContextDialog(page);

  await takeScreenshotAndCheckHops(page, worker, 'api-key', state.apiKey);

  const { keyId, screenshots } = await saveAndReadScreenshots(
    page,
    api,
    app.projectId
  );
  expect(screenshots).toHaveLength(1);
  expect(screenshots[0].keyReferences.map((r) => r.keyId)).toEqual([keyId]);
});

test('takes a screenshot with an OAuth session and attaches it to the key', async ({
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
  await openInContextDialog(page);

  await takeScreenshotAndCheckHops(page, worker, 'oauth');

  const { keyId, screenshots } = await saveAndReadScreenshots(
    page,
    api,
    app.projectId
  );
  expect(screenshots).toHaveLength(1);
  expect(screenshots[0].keyReferences.map((r) => r.keyId)).toEqual([keyId]);
});

test('offers no screenshot capture on a key without the upload scope', async ({
  page,
  worker,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const key = await api.createApiKeyWithId(
    app.projectId,
    SCOPES_WITHOUT_UPLOAD
  );
  createdApiKeyIds.push(key.id);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, key.key);
  await spyOnCapture(worker);
  await openInContextDialog(page);

  const gallery = page
    .locator(DEV_TOOLS)
    .getByText('There are no screenshots.');
  await expect(gallery).toBeVisible();
  await expect(gallery).not.toContainText('camera icon');
  await expect(takeScreenshotButton(page)).toHaveCount(0);
  await expect(addImageButton(page)).toHaveCount(0);
  expect(await captures(worker)).toEqual([]);
});

test('reports the missing upload scope instead of silently dropping the screenshot', async ({
  page,
  worker,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const key = await api.createApiKeyWithId(app.projectId);
  createdApiKeyIds.push(key.id);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, key.key);
  await openInContextDialog(page);

  // The dialog computed its permissions on open; the scope goes away underneath it, as a key edit on the server would.
  await api.updateApiKeyScopes(key.id, SCOPES_WITHOUT_UPLOAD);
  await takeScreenshotAndCheckHops(page, worker, 'api-key', key.key);

  await saveButton(page).click();
  await expect(dialogAlert(page)).toContainText('Operation not permitted');
  await expect(dialogAlert(page)).toContainText(
    'Missing scopes: screenshots.upload'
  );
  await expect(dialogTitle(page)).toBeVisible();
  const keyId = await api.findKeyId(app.projectId, KEY_NAME);
  if (keyId !== null) {
    expect(await api.keyScreenshots(app.projectId, keyId)).toEqual([]);
  }
});
