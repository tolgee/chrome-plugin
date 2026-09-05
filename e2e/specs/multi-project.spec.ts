import { expect, test } from '../fixtures/extension';
import {
  collectWorkerRequests,
  completeAuthorization,
  installIdentityStub,
  requestsSentWith,
  storedOAuthSessions,
  requireOAuthServer,
} from '../fixtures/oauth';
import {
  openInContextDialog,
  openTestapp,
  sessionItem,
} from '../fixtures/testapp';

requireOAuthServer();

test('keeps a separate session for each project on the same server', async ({
  context,
  worker,
  extensionId,
  state,
  openPopup,
}) => {
  expect(state.apps.length).toBeGreaterThanOrEqual(2);
  const pages = [];
  for (const app of state.apps) {
    const page = await context.newPage();
    await openTestapp(page, app.url);
    const popup = await openPopup(page);
    await installIdentityStub(worker);

    const reloaded = page.waitForEvent('load');
    await popup.getByTestId('connect-oauth').click();
    await completeAuthorization({
      context,
      worker,
      extensionId,
      tolgeeUrl: state.tolgeeUrl,
      user: state.user,
      target: page,
    });
    await reloaded;

    await expect(popup.getByTestId('connected-panel')).toBeVisible();
    await expect(popup.getByTestId('project-link')).toHaveText(app.projectName);
    await popup.close();
    pages.push(page);
  }

  const sessions = await storedOAuthSessions(worker);
  expect(sessions).toHaveLength(state.apps.length);
  expect(new Set(sessions.map((s) => s.projectKey))).toEqual(
    new Set(state.apps.map((app) => String(app.projectId)))
  );
  expect(new Set(sessions.map((s) => s.accessToken)).size).toBe(
    sessions.length
  );

  // One collector for the whole test, not one per tab: each tab's SDK starts loading its own translations through
  // the dev backend as soon as it connects, independently of opening the dialog below.
  const allRequests = collectWorkerRequests(context);

  for (const [i, page] of pages.entries()) {
    const app = state.apps[i];
    const session = sessions.find(
      (s) => s.projectKey === String(app.projectId)
    );
    await expect
      .poll(() => sessionItem(page, '__tolgee_projectId'))
      .toBe(String(app.projectId));
    expect(await sessionItem(page, '__tolgee_projectKey')).toBe(
      String(app.projectId)
    );
    expect(await sessionItem(page, '__tolgee_session')).toBe('oauth');

    await page.bringToFront();
    await openInContextDialog(page);

    const requests = await requestsSentWith(allRequests, session!);

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const url = request.url();
      if (url.includes('/v2/projects/')) {
        expect(url).toContain(`/v2/projects/${app.projectId}/`);
      }
    }
    await page.keyboard.press('Escape');
  }
});
