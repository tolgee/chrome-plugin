import type { Frame, Page } from '@playwright/test';
import { servePage, PLAIN_PAGE_HTML } from './testapp';

// The window.postMessage protocol between the page, the content script and the worker: what an SDK (or a script
// pretending to be one, or an XSS payload) can say to the extension and what it gets back.

// The content script arrives at document_idle; it answers the SDK's TOLGEE_PING once it listens.
export const waitForContentScript = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'TOLGEE_PONG') {
            window.removeEventListener('message', onMessage);
            clearInterval(timer);
            resolve();
          }
        };
        window.addEventListener('message', onMessage);
        const timer = setInterval(() => {
          if (Date.now() > deadline) {
            clearInterval(timer);
            reject(new Error('no content script answered TOLGEE_PING'));
          }
          window.postMessage({ type: 'TOLGEE_PING' }, '*');
        }, 200);
      })
  );

// A real old release would need its own in-context bundle from the CDN, which the suite must not depend on.
export const pretendOldSdk = (page: Page) =>
  page.addInitScript(() => {
    const post = window.postMessage.bind(window);
    window.postMessage = ((message: any, ...rest: any[]) => {
      if (message?.type === 'TOLGEE_READY' && message.data) {
        const data = { ...message.data };
        delete data.protocolVersion;
        message = { ...message, data };
      }
      return (post as any)(message, ...rest);
    }) as typeof window.postMessage;
  });

/**
 * Serves a page at `${appUrl}/__e2e_old-sdk.html` whose SDK reports `uiPresent: true` but no `protocolVersion`:
 * a current in-context SDK from before the proxied-request protocol, with no SDK actually running (see
 * pretendOldSdk for the full flow on the testapp).
 */
export const serveOldSdkPage = async (
  page: Page,
  appUrl: string,
  { apiUrl, projectId }: { apiUrl: string; projectId: number }
): Promise<void> => {
  const url = `${appUrl}/__e2e_old-sdk.html`;
  await servePage(page, url, PLAIN_PAGE_HTML);
  await page.goto(url);
  await waitForContentScript(page);
  await page.evaluate(
    ({ apiUrl, projectId }) =>
      window.postMessage(
        {
          type: 'TOLGEE_READY',
          data: {
            uiPresent: true,
            mode: 'production',
            config: { apiUrl, apiKey: '', projectId },
          },
        },
        '*'
      ),
    { apiUrl, projectId }
  );
};

export type ProxyReply = {
  id: string;
  response?: { status: number };
  error?: { kind: string; message: string };
};

// What a script on the page gets back when it posts TOLGEE_API_REQUEST itself, as an XSS payload would.
export const askExtension = (
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

export const findInPage = (page: Page, needle: string): Promise<string[]> =>
  page.evaluate((needle) => {
    const hits: string[] = [];
    const seen = new WeakSet<object>();
    const scan = (label: string, value: unknown, depth: number) => {
      if (typeof value === 'string') {
        if (value.includes(needle)) {
          hits.push(label);
        }
        return;
      }
      if (
        depth === 0 ||
        value === null ||
        (typeof value !== 'object' && typeof value !== 'function') ||
        seen.has(value as object) ||
        value instanceof Node
      ) {
        return;
      }
      seen.add(value as object);
      for (const name of Object.getOwnPropertyNames(value)) {
        try {
          scan(`${label}.${name}`, (value as any)[name], depth - 1);
        } catch {
          // restricted or cross-origin accessor
        }
      }
    };
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      scan(`sessionStorage.${key}`, sessionStorage.getItem(key), 1);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      scan(`localStorage.${key}`, localStorage.getItem(key), 1);
    }
    scan('document.cookie', document.cookie, 1);
    scan('document', document.documentElement.outerHTML, 1);
    scan('window', window, 4);
    return hits;
  }, needle);
