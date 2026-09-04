import type { Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';

export const TITLE = '.header__title';
export const IN_CONTEXT_DIALOG_TEXT = 'Quick translation';

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

export const openInContextDialog = async (page: Page) => {
  await page.locator(TITLE).click({ modifiers: ['Alt'] });
  await expect(
    page.locator('#__tolgee_dev_tools').getByText(IN_CONTEXT_DIALOG_TEXT)
  ).toBeVisible({ timeout: 30_000 });
};

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

// The content script arrives at document_idle; it answers the SDK's TOLGEE_PING once it listens.
export const waitForContentScript = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'TOLGEE_PONG') {
            window.removeEventListener('message', onMessage);
            clearInterval(timer);
            resolve();
          }
        };
        window.addEventListener('message', onMessage);
        const timer = setInterval(() => {
          if (Date.now() > deadline) {
            clearInterval(timer);
            reject(new Error('no content script answered TOLGEE_PING'));
          }
          window.postMessage({ type: 'TOLGEE_PING' }, '*');
        }, 200);
      })
  );
