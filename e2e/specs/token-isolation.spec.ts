import { expect, test } from '../fixtures/extension';
import {
  collectPageRequests,
  collectWorkerRequests,
  requireOAuthServer,
  signInThroughPopup,
  storedOAuthSessions,
} from '../fixtures/oauth';
import {
  askExtension,
  findInPage,
  openInContextDialog,
  openTestapp,
  servePage,
} from '../fixtures/testapp';

requireOAuthServer();

test('keeps the access token out of the page and refuses what the SDK does not need', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
  // Attached before the page loads: the app's own loads are in here too, so the page is never silent.
  const pageRequests = collectPageRequests(page);
  const workerRequests = collectWorkerRequests(context);
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
  const [session] = await storedOAuthSessions(worker);
  expect(session.accessToken.length).toBeGreaterThan(10);

  await test.step('nothing a page script can reach holds the token', async () => {
    expect(await findInPage(page, session.accessToken)).toEqual([]);
    if (session.refreshToken) {
      expect(await findInPage(page, session.refreshToken)).toEqual([]);
    }
  });

  await test.step('nothing the page sends carries a credential; the worker does the authorized calls, with the token', async () => {
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
      expect(headers['authorization'], request.url()).toBeUndefined();
      expect(headers['x-api-key'], request.url()).toBeUndefined();
    }
    for (const request of workerRequests) {
      expect((await request.allHeaders())['authorization'], request.url()).toBe(
        `Bearer ${session.accessToken}`
      );
    }
    await page.keyboard.press('Escape');
  });

  await test.step('a page script can only reach what the SDK needs: the connected project, on the connected server', async () => {
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
  });

  await test.step('a cross-origin frame inside the connected tab is refused before any session lookup', async () => {
    const frameUrl = `${other.url}/__e2e_frame.html`;
    await servePage(
      page,
      frameUrl,
      '<!doctype html><title>frame</title><p>cross-origin frame</p>'
    );
    await page.evaluate((src) => {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      document.body.appendChild(iframe);
    }, frameUrl);
    await expect
      .poll(() => page.frames().some((f) => f.url() === frameUrl))
      .toBe(true);
    const frame = page.frames().find((f) => f.url() === frameUrl)!;
    await frame.waitForLoadState();
    expect(
      (await askExtension(frame, `/v2/projects/${app.projectId}/keys`)).error
        ?.kind
    ).toBe('not_allowed');
  });

  await test.step('a top-level page on an origin nobody signed in gets no session at all', async () => {
    const stranger = await context.newPage();
    await openTestapp(stranger, other.url);
    expect(
      (await askExtension(stranger, `/v2/projects/${app.projectId}/keys`)).error
        ?.kind
    ).toBe('no_session');
  });
});
