import type { BrowserContext, Page, Request, Worker } from '@playwright/test';
import { expect } from '@playwright/test';
import type { User } from '../setup/seed';
import { readState } from '../setup/state';
import { test } from './extension';
import { waitFor } from './wait';

/**
 * File-level gate for the specs that sign in through OAuth: skips them, with the probe's finding as the reason, on a
 * server without a usable authorization server (see setup/oauthProbe.ts).
 */
export const requireOAuthServer = () => {
  const oauth = readState().oauth;
  test.skip(!oauth.available, oauth.reason);
};

const AUTHORIZE_KEY = 'e2eAuthorizeUrl';
const REDIRECT_KEY = 'e2eRedirectUrl';

/**
 * Replaces `chrome.identity.launchWebAuthFlow` in the extension's service worker: Playwright cannot drive Chrome's
 * identity window. The stub parks the authorize URL in `chrome.storage.session` and resolves with whatever redirect
 * URL the test writes back there, after it has driven the consent screen in an ordinary page (completeAuthorization).
 *
 * Callback-style on purpose: webextension-polyfill looks `chrome.identity.launchWebAuthFlow` up at call time and
 * passes it a callback.
 */
export const installIdentityStub = (worker: Worker) =>
  worker.evaluate(
    ([authorizeKey, redirectKey]) => {
      chrome.identity.launchWebAuthFlow = (
        details: { url: string },
        callback?: (redirectUrl?: string) => void
      ) =>
        new Promise<string>((resolve) => {
          const onChanged = (
            changes: Record<string, { newValue?: unknown }>,
            area: string
          ) => {
            const redirectUrl =
              area === 'session' ? changes[redirectKey]?.newValue : undefined;
            if (typeof redirectUrl !== 'string') {
              return;
            }
            chrome.storage.onChanged.removeListener(onChanged);
            chrome.storage.session.remove([authorizeKey, redirectKey]);
            callback?.(redirectUrl);
            resolve(redirectUrl);
          };
          chrome.storage.onChanged.addListener(onChanged);
          chrome.storage.session.set({ [authorizeKey]: details.url });
        });
    },
    [AUTHORIZE_KEY, REDIRECT_KEY]
  );

export const waitForAuthorizeUrl = (worker: Worker) =>
  waitFor<string>(
    () =>
      worker.evaluate(
        (key) => chrome.storage.session.get(key).then((r: any) => r[key]),
        AUTHORIZE_KEY
      ),
    'the extension to start the authorization flow'
  );

// The consent screen authenticates with the webapp's JWT from localStorage.
export const loginToWebapp = async (
  page: Page,
  tolgeeUrl: string,
  user: User
) => {
  const res = await page.request.post(`${tolgeeUrl}/api/public/generatetoken`, {
    data: user,
  });
  expect(res.ok(), `login as ${user.username}`).toBeTruthy();
  const { accessToken } = await res.json();
  await page.goto(`${tolgeeUrl}/login`, { timeout: 60_000 });
  await page.evaluate(
    (token) => localStorage.setItem('jwtToken', token),
    accessToken
  );
};

export type ConsentProject = { kind: 'all' } | { kind: 'one'; name: string };

type AuthorizationArgs = {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  tolgeeUrl: string;
  user: User;
  /** The page the popup is acting on; it is made the active tab again before the flow is resolved. */
  target: Page;
  decision?: 'allow' | 'deny';
  project?: ConsentProject;
};

const chooseConsentProject = async (page: Page, project: ConsentProject) => {
  await expect(
    page.locator('[data-cy="oauth2-consent-project"]')
  ).toBeVisible();
  if (project.kind === 'all') {
    await page.locator('[data-cy="oauth2-consent-project-all"]').click();
    return;
  }
  await page.locator('[data-cy="oauth2-consent-project-one"]').click();
  await page.locator('[data-cy="project-select"]').click();
  await page
    .locator(
      `[data-cy="project-search-select-item"][data-cy-project-name="${project.name}"]`
    )
    .click();
  await expect(page.locator('[data-cy="project-select"]')).toContainText(
    project.name
  );
};

/**
 * Drives the authorization the stubbed identity flow is waiting for: signs `user` in on the Tolgee origin, opens the
 * authorize URL, answers the consent screen and hands the `https://<id>.chromiumapp.org/?code=...` redirect back to
 * the extension.
 */
export const completeAuthorization = async ({
  context,
  worker,
  extensionId,
  tolgeeUrl,
  user,
  target,
  decision = 'allow',
  project,
}: AuthorizationArgs) => {
  const authorizeUrl = await waitForAuthorizeUrl(worker);
  const page = await context.newPage();
  await loginToWebapp(page, tolgeeUrl, user);

  let redirectUrl: string | undefined;
  await page.route(`https://${extensionId}.chromiumapp.org/**`, (route) => {
    redirectUrl = route.request().url();
    return route.fulfill({
      status: 200,
      body: 'authorization redirect captured',
    });
  });
  await page.goto(authorizeUrl, { timeout: 60_000 });
  if (project) {
    await chooseConsentProject(page, project);
  }

  const button = page.locator(`[data-cy="oauth2-consent-${decision}"]`);
  await waitFor(async () => {
    if (redirectUrl) {
      return true;
    }
    if (await button.isVisible()) {
      await expect(button).toBeEnabled();
      await button.click();
      return true;
    }
    return false;
  }, 'the consent screen');
  await waitFor(() => redirectUrl, 'the authorization redirect');

  await page.close();
  await target.bringToFront();
  await worker.evaluate(
    ([key, url]) => chrome.storage.session.set({ [key]: url }),
    [REDIRECT_KEY, redirectUrl!]
  );
  return { authorizeUrl, redirectUrl: redirectUrl! };
};

export type StoredSession = {
  apiUrl: string;
  projectKey: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

/** The OAuth sessions the extension holds in `chrome.storage.local` (see oauth/tokenStore.ts). */
export const storedOAuthSessions = (worker: Worker): Promise<StoredSession[]> =>
  worker.evaluate(() =>
    chrome.storage.local.get(null).then((all: Record<string, unknown>) =>
      Object.entries(all)
        .filter(([key]) => key.startsWith('oauth:'))
        .map(([, value]) => value)
    )
  );

type SignInArgs = Omit<AuthorizationArgs, 'decision'> & { popup: Page };

/** Connect to Tolgee from the popup: stubbed identity flow, consent allowed, page reloaded with the token. */
export const signInThroughPopup = async ({ popup, ...args }: SignInArgs) => {
  await installIdentityStub(args.worker);
  const reloaded = args.target.waitForEvent('load');
  await popup.getByTestId('connect-oauth').click();
  await completeAuthorization(args);
  await reloaded;
  await expect(popup.getByTestId('connected-panel')).toBeVisible();
};

/** Backdates every stored OAuth session so the next freshness check sees an expired access token. */
export const expireStoredSessions = (worker: Worker) =>
  worker.evaluate(async () => {
    const all: Record<string, any> = await chrome.storage.local.get(null);
    const expired = Object.fromEntries(
      Object.entries(all)
        .filter(([key]) => key.startsWith('oauth:'))
        .map(([key, value]) => [key, { ...value, expiresAt: Date.now() - 1 }])
    );
    await chrome.storage.local.set(expired);
  });

/**
 * The requests the extension's service worker makes to the Tolgee API on the page's behalf. Playwright reports
 * service worker requests only with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS (set in playwright.config.ts).
 */
export const collectWorkerRequests = (
  context: BrowserContext,
  match: (request: Request) => boolean = (request) =>
    request.url().includes('/v2/') && request.method() !== 'OPTIONS'
): Request[] => {
  const requests: Request[] = [];
  context.on('request', (request) => {
    if (request.serviceWorker() && match(request)) {
      requests.push(request);
    }
  });
  return requests;
};

export const requestsSentWith = async (
  requests: Request[],
  session: Pick<StoredSession, 'accessToken'>
): Promise<Request[]> => {
  const authorized = await Promise.all(
    requests.map(async (request) => ({
      request,
      authorization: (await request.allHeaders())['authorization'],
    }))
  );
  return authorized
    .filter(
      ({ authorization }) => authorization === `Bearer ${session.accessToken}`
    )
    .map(({ request }) => request);
};

export const collectPageRequests = (page: Page): Request[] => {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  return requests;
};
