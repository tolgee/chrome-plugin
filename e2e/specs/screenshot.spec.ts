import type { BrowserContext, Request } from '@playwright/test';
import { apiAs } from '../fixtures/api';
import { expect, type Page, test, type Worker } from '../fixtures/extension';
import { collectWorkerRequests, signInThroughPopup } from '../fixtures/oauth';
import {
  addImageButton,
  connectWithApiKey,
  DEV_TOOLS,
  dialogAlert,
  galleryThumbnails,
  keyFormSubmit,
  openInContextDialog,
  openTestapp,
  takeScreenshotButton,
} from '../fixtures/testapp';
import {
  API_KEY_SCOPES,
  type KeyScreenshot,
  type TolgeeApi,
} from '../setup/seed';
import type { RunState } from '../setup/state';

const TWO_BY_TWO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGP4z8DwHwohFABFzAf5Zsv/OQAAAABJRU5ErkJggg==',
  'base64'
);

// The key behind the testapp's title (see importKeys in setup/seed.ts); the dialog opened by alt+clicking it.
const KEY_NAME = 'app-title';
const SCOPES_WITHOUT_UPLOAD = API_KEY_SCOPES.filter(
  (scope) => scope !== 'screenshots.upload' && scope !== 'screenshots.delete'
);
const VIEWPORT = { width: 1280, height: 720 };

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

type UploadEntry = {
  name: string;
  fileName?: string;
  type?: string;
  size?: number;
};

const spyOnUploads = (worker: Worker) =>
  worker.evaluate(() => {
    const original = globalThis.fetch;
    const uploads: UploadEntry[][] = [];
    (globalThis as any).__e2eUploads = uploads;
    globalThis.fetch = (input: any, init?: any) => {
      if (init?.body instanceof FormData) {
        const entries: UploadEntry[] = [];
        init.body.forEach((value: any, name: string) => {
          entries.push(
            value instanceof Blob
              ? {
                  name,
                  fileName: (value as File).name,
                  type: value.type,
                  size: value.size,
                }
              : { name, type: 'text' }
          );
        });
        uploads.push(entries);
      }
      return original(input, init);
    };
  });

const uploadsSent = (worker: Worker): Promise<UploadEntry[][]> =>
  worker.evaluate(() => (globalThis as any).__e2eUploads ?? []);

const captures = (worker: Worker): Promise<Capture[]> =>
  worker.evaluate(() =>
    ((globalThis as any).__e2eCaptures ?? []).map((c: Capture) => ({
      windowId: c.windowId,
      dataUrl: c.dataUrl.slice(0, 40),
    }))
  );

const listenForScreenshotMessages = (page: Page) =>
  page.evaluate(() => {
    const taken: string[] = [];
    const captured: string[] = [];
    (window as any).__e2eScreenshotTaken = taken;
    (window as any).__e2eScreenshotCaptured = captured;
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'TOLGEE_SCREENSHOT_TAKEN') {
        taken.push(String(event.data.data).slice(0, 40));
      }
      if (event.data?.type === 'TOLGEE_SCREENSHOT_CAPTURED') {
        captured.push(JSON.stringify(event.data.data));
      }
    });
  });

const screenshotMessages = (
  page: Page
): Promise<{ taken: string[]; captured: string[] }> =>
  page.evaluate(() => ({
    taken: (window as any).__e2eScreenshotTaken ?? [],
    captured: (window as any).__e2eScreenshotCaptured ?? [],
  }));

const isUpload = (request: Request) =>
  request.url().endsWith('/v2/image-upload') && request.method() === 'POST';

/** The page's uploads to `/v2/image-upload` (CORS preflights carry no credentials and are ignored). */
const collectUploads = (page: Page): Request[] => {
  const uploads: Request[] = [];
  page.on('request', (request) => {
    if (isUpload(request)) {
      uploads.push(request);
    }
  });
  return uploads;
};

type Credential = 'api-key' | 'oauth';

const takeScreenshotAndCheckHops = async (
  page: Page,
  context: BrowserContext,
  worker: Worker,
  credential: Credential,
  apiKey?: string
) => {
  await spyOnCapture(worker);
  await listenForScreenshotMessages(page);
  const pageUploads = collectUploads(page);
  const workerUploads = collectWorkerRequests(context, isUpload);

  await takeScreenshotButton(page).click();
  await expect(galleryThumbnails(page)).toHaveCount(1);
  await expect(
    galleryThumbnails(page).locator('[data-cy="screenshot-image"]')
  ).toBeVisible();

  const captured = await captures(worker);
  expect(captured).toHaveLength(1);
  expect(typeof captured[0].windowId).toBe('number');
  expect(captured[0].dataUrl).toMatch(/^data:image\/(jpeg|png);base64,/);

  const messages = await screenshotMessages(page);
  expect(messages.taken).toEqual([]);
  expect(messages.captured).toHaveLength(1);
  expect(JSON.parse(messages.captured[0])).toEqual({
    id: expect.any(String),
  });
  expect(pageUploads).toHaveLength(0);
  expect(workerUploads).toHaveLength(1);
  const upload: Request = workerUploads[0];
  const headers = await upload.allHeaders();
  expect(headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  if (credential === 'api-key') {
    expect(headers['x-api-key']).toBe(apiKey);
    expect(headers['authorization']).toBeUndefined();
  } else {
    expect(headers['authorization']).toMatch(/^Bearer /);
    expect(headers['x-api-key']).toBeUndefined();
  }
  expect((await upload.response())?.status()).toBe(201);
};

/** Saves the dialog and returns the key's screenshots as the server lists them once the save went through. */
const saveAndReadScreenshots = async (
  page: Page,
  api: TolgeeApi,
  projectId: number
) => {
  await keyFormSubmit(page).click();
  // A successful save closes the dialog by itself; a failed one keeps it open with an alert.
  await expect(keyFormSubmit(page)).toBeHidden();
  const keyId = await api.findKeyId(projectId, KEY_NAME);
  expect(keyId, `key ${KEY_NAME} exists after the save`).not.toBeNull();
  return {
    keyId: keyId!,
    screenshots: await api.keyScreenshots(projectId, keyId!),
  };
};

const geometryOf = (screenshot: KeyScreenshot) => ({
  width: screenshot.width,
  height: screenshot.height,
  positions: screenshot.keyReferences.map((ref) => ref.position),
});

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

test('takes a screenshot with an API key, uploaded by the worker, and attaches it to the key', async ({
  page,
  context,
  worker,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);
  await openInContextDialog(page);

  await takeScreenshotAndCheckHops(
    page,
    context,
    worker,
    'api-key',
    state.apiKey
  );

  const { keyId, screenshots } = await saveAndReadScreenshots(
    page,
    api,
    app.projectId
  );
  expect(screenshots).toHaveLength(1);
  expect(screenshots[0].keyReferences.map((r) => r.keyId)).toEqual([keyId]);
});

test('takes a screenshot with an OAuth session, uploaded by the worker, and attaches it to the key', async ({
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

  await takeScreenshotAndCheckHops(page, context, worker, 'oauth');

  const { keyId, screenshots } = await saveAndReadScreenshots(
    page,
    api,
    app.projectId
  );
  expect(screenshots).toHaveLength(1);
  expect(screenshots[0].keyReferences.map((r) => r.keyId)).toEqual([keyId]);
});

test('reports the same image size and key positions with an API key and with an OAuth session', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  test.skip(!state.oauth.available, state.oauth.reason);
  const app = state.apps[0];
  await page.setViewportSize(VIEWPORT);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);
  await openInContextDialog(page);
  await takeScreenshotButton(page).click();
  await expect(galleryThumbnails(page)).toHaveCount(1);
  const viaApiKey = await saveAndReadScreenshots(page, api, app.projectId);
  expect(viaApiKey.screenshots).toHaveLength(1);
  await removeKeyScreenshots(state);

  const reloaded = page.waitForEvent('load');
  await popup.getByTestId('sign-out').click();
  await reloaded;
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await popup.getByTestId('all-connection-options').click();
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
  await takeScreenshotButton(page).click();
  await expect(galleryThumbnails(page)).toHaveCount(1);
  const viaOAuth = await saveAndReadScreenshots(page, api, app.projectId);
  expect(viaOAuth.screenshots).toHaveLength(1);

  const expected = geometryOf(viaApiKey.screenshots[0]);
  expect(expected.width).toBeGreaterThan(0);
  expect(expected.positions).toHaveLength(1);
  expect(geometryOf(viaOAuth.screenshots[0])).toEqual(expected);
});

test('uploads a dropped image through the worker with its file name and type intact', async ({
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
  await spyOnUploads(worker);
  const pageUploads = collectUploads(page);
  const workerUploads = collectWorkerRequests(context, isUpload);

  await page.locator(DEV_TOOLS).locator('input[type="file"]').setInputFiles({
    name: 'dropped.png',
    mimeType: 'image/png',
    buffer: TWO_BY_TWO_PNG,
  });
  await expect(galleryThumbnails(page)).toHaveCount(1);

  expect(pageUploads).toHaveLength(0);
  expect(workerUploads).toHaveLength(1);
  expect((await workerUploads[0].response())?.status()).toBe(201);
  // Playwright reports no body for a service worker's requests; the FormData the worker rebuilt is read at the source.
  expect(await uploadsSent(worker)).toEqual([
    [
      {
        name: 'image',
        fileName: 'dropped.png',
        type: 'image/png',
        size: TWO_BY_TWO_PNG.length,
      },
    ],
  ]);
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
    .locator('[data-cy="screenshot-empty"]');
  await expect(gallery).toBeVisible();
  await expect(gallery).not.toContainText('camera icon');
  await expect(takeScreenshotButton(page)).toHaveCount(0);
  await expect(addImageButton(page)).toHaveCount(0);
  expect(await captures(worker)).toEqual([]);
});

test('reports the missing upload scope instead of silently dropping the screenshot', async ({
  page,
  context,
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
  await takeScreenshotAndCheckHops(page, context, worker, 'api-key', key.key);

  // Revoked only after the upload succeeds, as a live key edit would.
  await api.updateApiKeyScopes(key.id, SCOPES_WITHOUT_UPLOAD);
  await keyFormSubmit(page).click();
  await expect(dialogAlert(page)).toContainText('Operation not permitted');
  await expect(dialogAlert(page)).toContainText(
    'Missing scopes: screenshots.upload'
  );
  await expect(keyFormSubmit(page)).toBeVisible();
  const keyId = await api.findKeyId(app.projectId, KEY_NAME);
  if (keyId !== null) {
    expect(await api.keyScreenshots(app.projectId, keyId)).toEqual([]);
  }
});
