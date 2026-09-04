import {
  type BrowserContext,
  chromium,
  type Page,
  test as base,
  type Worker,
} from '@playwright/test';
import { readState, type RunState } from '../setup/state';

type Fixtures = {
  state: RunState;
  worker: Worker;
  extensionId: string;
  /**
   * Opens the popup UI as a regular tab. The popup finds the page it should act on through
   * `tabs.query({ active: true, currentWindow: true })`, so the target is brought to front before the popup tab
   * loads; the popup tab itself stays in the background.
   */
  openPopup: (target: Page) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  state: async ({}, use) => {
    await use(readState());
  },
  context: async ({ headless, state }, use) => {
    // An empty userDataDir makes Playwright create and remove a throwaway profile, so every test starts with empty
    // extension storage.
    const context = await chromium.launchPersistentContext('', {
      // The bundled Chromium: unlike the headless shell it supports extensions when headless.
      channel: 'chromium',
      headless,
      args: [
        `--disable-extensions-except=${state.distDir}`,
        `--load-extension=${state.distDir}`,
      ],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context, state }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      // The MV3 worker normally starts with the extension; if Chromium has already parked it, a content script's
      // first runtime message (any page on the testapp origin) starts it again.
      const started = context.waitForEvent('serviceworker');
      const wake = setTimeout(async () => {
        const page = await context.newPage().catch(() => undefined);
        await page?.goto(state.apps[0].url).catch(() => undefined);
        await page?.close().catch(() => undefined);
      }, 5_000);
      worker = await started.finally(() => clearTimeout(wake));
    }
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  openPopup: async ({ context, extensionId }, use) => {
    await use(async (target) => {
      const popup = await context.newPage();
      await target.bringToFront();
      await popup.goto(`chrome-extension://${extensionId}/index.html`);
      return popup;
    });
  },
});

export const expect = test.expect;

export type { BrowserContext, Page, Worker };
