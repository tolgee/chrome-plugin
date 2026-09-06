import { expect, test } from '../fixtures/extension';
import { collectPageRequests, collectWorkerRequests } from '../fixtures/oauth';
import {
  connectWithApiKey,
  declareApiKey,
  openInContextDialog,
  openTestapp,
  sessionItem,
  TITLE,
} from '../fixtures/testapp';
import { askExtension, findInPage } from '../fixtures/pageProtocol';

test('keeps a key entered in the popup out of the page and sends its requests from the worker', async ({
  page,
  context,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
  // Attached before the page loads: the app's own loads are in here too, so the page is never silent.
  const pageRequests = collectPageRequests(page);
  const workerRequests = collectWorkerRequests(context);
  await openTestapp(page, app.url);
  const popup = await openPopup(page);
  await connectWithApiKey(popup, page, state.apiKey);

  await test.step('nothing a page script can reach holds the key', async () => {
    expect(await sessionItem(page, '__tolgee_session')).toBe('apiKey');
    expect(await findInPage(page, state.apiKey)).toEqual([]);
    expect(await findInPage(page, String(app.projectId))).toContain(
      'sessionStorage.__tolgee_projectId'
    );
  });

  await test.step('nothing the page sends carries a credential; the worker does the authorized calls, with the key', async () => {
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
    expect(pageRequests.length).toBeGreaterThan(0);
    for (const request of pageRequests) {
      const headers = await request.allHeaders();
      expect(headers['x-api-key'], request.url()).toBeUndefined();
      expect(headers['authorization'], request.url()).toBeUndefined();
    }
    expect(workerRequests.length).toBeGreaterThan(0);
    for (const request of workerRequests) {
      const headers = await request.allHeaders();
      expect(headers['x-api-key'], request.url()).toBe(state.apiKey);
      expect(headers['authorization'], request.url()).toBeUndefined();
    }
    await page.keyboard.press('Escape');
  });

  await test.step("a page script can only reach the key's project on the connected server", async () => {
    expect((await askExtension(page, '/v2/user')).error?.kind).toBe(
      'not_allowed'
    );
    expect((await askExtension(page, '//evil.example/x')).error?.kind).toBe(
      'not_allowed'
    );
    expect(
      (await askExtension(page, `/v2/projects/${other.projectId}/keys`)).error
        ?.kind
    ).toBe('not_allowed');
    expect(
      (await askExtension(page, `/v2/projects/${app.projectId}/keys`)).response
        ?.status
    ).toBe(200);
    expect(
      (
        await askExtension(
          page,
          `/v2/api-keys/current-permissions?projectId=${other.projectId}`
        )
      ).error?.kind
    ).toBe('not_allowed');
    expect(
      (
        await askExtension(
          page,
          `/v2/api-keys/current-permissions?projectId=${app.projectId}`
        )
      ).response?.status
    ).toBe(200);
  });

  await test.step('a top-level page on an origin nobody connected gets no session at all', async () => {
    const stranger = await context.newPage();
    await openTestapp(stranger, other.url);
    expect(
      (await askExtension(stranger, `/v2/projects/${app.projectId}/keys`)).error
        ?.kind
    ).toBe('no_session');
  });
});

test("a key in the site's own code is still used by the page directly", async ({
  page,
  context,
  state,
}) => {
  const app = state.apps[0];
  const pageRequests = collectPageRequests(page);
  const workerRequests = collectWorkerRequests(context);
  await declareApiKey(page, app.url, state.apiKey);
  await page.goto(app.url);
  await expect(page.locator(TITLE)).toBeVisible({ timeout: 60_000 });

  await openInContextDialog(page);
  const withKey = [];
  for (const request of pageRequests) {
    if ((await request.allHeaders())['x-api-key'] === state.apiKey) {
      withKey.push(request.url());
    }
  }
  expect(withKey.some((url) => url.includes('/v2/projects'))).toBe(true);
  expect(workerRequests).toEqual([]);
  expect(await sessionItem(page, '__tolgee_session')).toBeNull();
  expect(
    (await askExtension(page, `/v2/projects/${app.projectId}/keys`)).error?.kind
  ).toBe('no_session');
});
