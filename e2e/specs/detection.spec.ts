import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures/extension';
import {
  declareProject,
  openTestapp,
  PLAIN_PAGE_HTML,
  servePage,
  serveOldSdkPage,
  TITLE,
  waitForContentScript,
} from '../fixtures/testapp';

test('shows the sign-in screen with the page project detected', async ({
  page,
  state,
  openPopup,
}) => {
  await openTestapp(page, state.apps[0].url);

  const popup = await openPopup(page);

  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('project-not-detected')).toHaveCount(0);
  await expect(popup.getByTestId('server-host')).toHaveText(
    new URL(state.tolgeeUrl).host
  );
});

// Regression: the popup used to give up on the page after 4 s without a content script and show "No access to
// this page" for good, even once the page came back. The content script (document_idle) only arrives after the
// parser has finished, so a parser-blocking script held for 6 s leaves the reloading tab without one long enough.
test('recovers when opened while the page is still reloading', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await openTestapp(page, app.url);
  const HOLD_SCRIPT = '/__e2e_hold.js';
  await page.route(`${app.url}/`, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      '<head>',
      `<head><script src="${HOLD_SCRIPT}"></script>`
    );
    await route.fulfill({ response, body: html });
  });
  await page.route(`${app.url}${HOLD_SCRIPT}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });

  const reloaded = page.reload({ timeout: 60_000 });
  const popup = await openPopup(page);
  await expect(popup.getByTestId('popup-loading')).toBeVisible();

  await reloaded;
  await expect(page.locator(TITLE)).toBeVisible();
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(popup.getByTestId('connect-oauth')).toBeEnabled();
  await expect(popup.getByTestId('popup-error')).toHaveCount(0);
});

test('tells a page without Tolgee apart', async ({
  page,
  state,
  openPopup,
}) => {
  const url = `${state.apps[0].url}/__e2e_plain.html`;
  await servePage(page, url, PLAIN_PAGE_HTML);
  await page.goto(url);

  const popup = await openPopup(page);
  await expect(popup.getByTestId('popup-not-present')).toContainText(
    "This website doesn't seem to be using Tolgee."
  );
  await expect(popup.getByTestId('sign-in-screen')).toHaveCount(0);
});

// No content script can run on about:blank, so the popup can never hear back from the page.
test('gives up on a page it cannot reach at all', async ({
  page,
  openPopup,
}) => {
  await page.goto('about:blank');
  const popup = await openPopup(page);

  await expect(popup.getByTestId('popup-not-present')).toBeVisible();
  await expect(popup.getByTestId('popup-error')).toContainText(
    'Error: No access to this page, try to refresh',
    { timeout: 30_000 }
  );
});

// Regression: the popup used to take every tab's handshake for its own page's, so another Tolgee tab reloading
// rewrote what the popup showed for this one.
test('ignores the handshakes of other tabs', async ({
  page,
  context,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
  await declareProject(page, app.url, '');
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await expect(popup.getByTestId('project-not-detected')).toBeVisible();
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();

  const otherTab = await context.newPage();
  await openTestapp(otherTab, other.url);
  for (let i = 0; i < 5; i++) {
    await otherTab.reload();
    await expect(otherTab.locator(TITLE)).toBeVisible();
  }

  await expect(popup.getByTestId('project-not-detected')).toBeVisible();
  await expect(popup.getByTestId('connect-oauth')).toBeDisabled();
  await expect(popup.getByTestId('popup-error')).toHaveCount(0);
});

test('reports an old SDK without the in-context UI as legacy', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const url = `${app.url}/__e2e_legacy.html`;
  await servePage(page, url, PLAIN_PAGE_HTML);
  await page.goto(url);
  await waitForContentScript(page);

  // What an SDK from before the in-context UI handshake sends: a config with no uiPresent flag.
  await page.evaluate(
    ({ apiUrl, projectId }) =>
      window.postMessage(
        {
          type: 'TOLGEE_READY',
          data: { config: { apiUrl, apiKey: '', projectId } },
        },
        '*'
      ),
    { apiUrl: state.tolgeeUrl, projectId: app.projectId }
  );

  const popup = await openPopup(page);
  await expect(popup.getByTestId('popup-legacy')).toContainText(
    'This website is using old version of Tolgee.'
  );
});

// See CredentialDelivery in src/types.ts for the protocol-2 requirement; api-key-legacy-sdk.spec.ts covers that path.
test('refuses to sign in on an SDK without proxy support and offers an API key instead', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  await serveOldSdkPage(page, app.url, {
    apiUrl: state.tolgeeUrl,
    projectId: app.projectId,
  });

  const popup = await openPopup(page);
  await expect(popup.getByTestId('sign-in-screen')).toBeVisible();
  await expect(popup.getByTestId('sdk-too-old')).toContainText(
    'Sign-in needs a newer Tolgee SDK'
  );
  await expect(popup.getByTestId('sdk-too-old')).toContainText(
    'update @tolgee/web to 7.2.0 or newer'
  );
  await expect(popup.getByTestId('sdk-too-old')).toContainText(
    'You can still connect with a project API key'
  );
  await expect(popup.getByTestId('connect-oauth')).toHaveCount(0);
  await expect(popup.getByTestId('use-api-key')).toBeVisible();

  await popup.getByTestId('use-api-key').click();
  await expect(popup.getByTestId('api-key-input')).toBeVisible();
  await expect(popup.getByTestId('sdk-too-old')).toHaveCount(0);
  await popup.getByTestId('all-connection-options').click();
  await expect(popup.getByTestId('sdk-too-old')).toBeVisible();
});

test('reports two Tolgee instances on a page embedding another one', async ({
  page,
  state,
  openPopup,
}) => {
  const app = state.apps[0];
  const sdkUrl = `${app.url}/__e2e_tolgee-web.js`;
  const url = `${app.url}/__e2e_wrapper.html`;
  await page.route(sdkUrl, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: fs.readFileSync(
        path.join(
          state.tolgeeJsDir,
          'packages/web/dist/tolgee-web.development.umd.min.js'
        ),
        'utf8'
      ),
    })
  );
  await servePage(
    page,
    url,
    `<!doctype html><title>wrapper</title>
     <script src="${sdkUrl}"></script>
     <h1>Wrapper with its own Tolgee</h1>
     <iframe src="/" width="600" height="300"></iframe>
     <script>
       // The SDK handshakes with the extension only a few times right after run(); the content script arrives at
       // document_idle, so an instance started this early would go unnoticed. Start once the content script answers.
       const start = () =>
         window['@tolgee/web'].Tolgee().init({
           apiUrl: ${JSON.stringify(state.tolgeeUrl)},
           projectId: ${app.projectId},
           language: 'en',
           staticData: { en: {} },
         }).run();
       const ping = setInterval(() => window.postMessage({ type: 'TOLGEE_PING' }, '*'), 200);
       window.addEventListener('message', function onPong(event) {
         if (event.data?.type !== 'TOLGEE_PONG') return;
         window.removeEventListener('message', onPong);
         clearInterval(ping);
         start();
       });
     </script>`
  );
  await page.goto(url);
  await expect(page.frameLocator('iframe').locator(TITLE)).toBeVisible();

  const popup = await openPopup(page);
  await expect(popup.getByTestId('popup-error')).toContainText(
    'Error: Detected multiple Tolgee instances'
  );
});
