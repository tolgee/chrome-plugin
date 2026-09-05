import browser from 'webextension-polyfill';
import { PageCredentials } from './content/credentialSink';
import { safeOrigin } from './oauth/url';

// Every tab of an origin shares the one session the extension holds for it, so a session that starts or ends has to
// reach all of them, not only the tab the popup is on.
export const deliverToOrigin = async (
  pageOrigin: string,
  credentials: PageCredentials
) => {
  // Filtered here, not through a `url` match pattern: Firefox match patterns reject ports, and a dev origin with a
  // port is the normal case.
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id != null && safeOrigin(tab.url) === pageOrigin)
      .map((tab) =>
        browser.tabs
          .sendMessage(tab.id!, {
            type: 'SET_CREDENTIALS',
            data: { ...credentials, pageOrigin },
          })
          .catch(() => undefined)
      )
  );
};
