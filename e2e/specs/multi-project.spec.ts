import { expect, test } from '../fixtures/extension';
import {
  completeAuthorization,
  installIdentityStub,
  storedOAuthSessions,
  requireOAuthServer,
} from '../fixtures/oauth';
import { openTestapp, sessionItem } from '../fixtures/testapp';

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
    expect(await sessionItem(page, '__tolgee_authToken')).toBe(
      session!.accessToken
    );
  }
});
