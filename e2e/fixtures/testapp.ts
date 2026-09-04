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
