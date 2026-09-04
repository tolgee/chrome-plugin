import type { BrowserContext, Page, Worker } from '@playwright/test';
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

const waitForAuthorizeUrl = (worker: Worker) =>
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

type AuthorizationArgs = {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  tolgeeUrl: string;
  user: User;
  /** The page the popup is acting on; it is made the active tab again before the flow is resolved. */
  target: Page;
  decision?: 'allow' | 'deny';
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

// Replaces the periodic alarm with one that fires right away (see REFRESH_ALARM in background.ts); an unpacked
// extension is allowed sub-minute alarms.
export const fireRefreshAlarm = (worker: Worker) =>
  worker.evaluate(() =>
    chrome.alarms.create('tolgee-oauth-refresh', { when: Date.now() + 100 })
  );
