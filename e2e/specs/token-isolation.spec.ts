import type { Frame } from '@playwright/test';
import { expect, type Page, test } from '../fixtures/extension';
import {
  collectPageRequests,
  requireOAuthServer,
  signInThroughPopup,
  storedOAuthSessions,
} from '../fixtures/oauth';
import {
  openInContextDialog,
  openTestapp,
  servePage,
} from '../fixtures/testapp';

requireOAuthServer();

type ProxyReply = {
  id: string;
  response?: { status: number };
  error?: { kind: string; message: string };
};

/** What a script on the page gets back when it posts TOLGEE_API_REQUEST itself, as an XSS payload would. */
const askExtension = (
  target: Page | Frame,
  path: string
): Promise<ProxyReply> =>
  target.evaluate(
    (path) =>
      new Promise<ProxyReply>((resolve, reject) => {
        const id = `probe-${Math.random()}`;
        const timer = setTimeout(
          () => reject(new Error(`no answer for ${path}`)),
          15_000
        );
        window.addEventListener('message', function onMessage(event) {
          if (
            event.data?.type === 'TOLGEE_API_RESPONSE' &&
            event.data.data?.id === id
          ) {
            window.removeEventListener('message', onMessage);
            clearTimeout(timer);
            resolve(event.data.data);
          }
        });
        window.postMessage(
          {
            type: 'TOLGEE_API_REQUEST',
            data: {
              id,
              path,
              method: 'GET',
              headers: {},
              body: { kind: 'none' },
            },
          },
          window.origin
        );
      }),
    path
  );

/** Every place a page script could read the token from, if it were there. */
const findInPage = (page: Page, needle: string): Promise<string[]> =>
  page.evaluate((needle) => {
    const hits: string[] = [];
    const scan = (label: string, value: unknown) => {
      if (typeof value === 'string' && value.includes(needle)) {
        hits.push(label);
      }
    };
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      scan(`sessionStorage.${key}`, sessionStorage.getItem(key));
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      scan(`localStorage.${key}`, localStorage.getItem(key));
    }
    scan('document.cookie', document.cookie);
    for (const name of Object.getOwnPropertyNames(window)) {
      try {
        scan(`window.${name}`, (window as any)[name]);
      } catch {
        // cross-origin or restricted accessor
      }
    }
    return hits;
  }, needle);

test('keeps the access token out of the page and refuses what the SDK does not need', async ({
  page,
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  const [app, other] = state.apps;
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

  // Nothing a page script can reach holds the token.
  expect(await findInPage(page, session.accessToken)).toEqual([]);
  if (session.refreshToken) {
    expect(await findInPage(page, session.refreshToken)).toEqual([]);
  }

  // Nothing the page sends carries a credential; the worker does the authorized calls.
  const pageRequests = collectPageRequests(page);
  await openInContextDialog(page);
  expect(pageRequests.length).toBeGreaterThan(0);
  for (const request of pageRequests) {
    const headers = await request.allHeaders();
    expect(headers['authorization'], request.url()).toBeUndefined();
    expect(headers['x-api-key'], request.url()).toBeUndefined();
  }
  await page.keyboard.press('Escape');

  // A page script can only reach what the SDK needs: the connected project, on the connected server.
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

  // A cross-origin frame inside the connected tab is refused before any session lookup.
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

  // A top-level page on an origin nobody signed in gets no session at all.
  const stranger = await context.newPage();
  await openTestapp(stranger, other.url);
  expect(
    (await askExtension(stranger, `/v2/projects/${app.projectId}/keys`)).error
      ?.kind
  ).toBe('no_session');
});
