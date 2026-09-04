import {
  API_URL_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../constants';

export const MAX_PROXY_PAYLOAD_BYTES = 20 * 1024 * 1024;

const RELAYED: Record<string, string> = {
  TOLGEE_API_REQUEST: 'TOLGEE_API_RESPONSE',
  TOLGEE_SCREENSHOT_UPLOAD: 'TOLGEE_SCREENSHOT_UPLOADED',
};
const CAPTURED = 'TOLGEE_SCREENSHOT_CAPTURED';

export type RelayDeps = {
  origin: string;
  getItem: (key: string) => string | null;
  sendToWorker: (message: { type: string; data: unknown }) => Promise<unknown>;
  postToPage: (message: { type: string; data: unknown }) => void;
};

export type PageMessageEvent = {
  source: unknown;
  origin: string;
  data?: { type?: string; data?: unknown };
};

// Page <-> worker relay for the SDK's API requests. No origin logic here: the worker derives the page origin from
// the sender tab; this only stamps which server and session the page believes it is applied to.
export const createApiProxyRelay = (deps: RelayDeps, self: unknown) => {
  const onPageMessage = (event: PageMessageEvent) => {
    if (event.source !== self || event.origin !== deps.origin) {
      return;
    }
    const type = event.data?.type;
    const replyType = type && RELAYED[type];
    const payload = event.data?.data as { id?: unknown } | undefined;
    if (!replyType || typeof payload?.id !== 'string') {
      return;
    }
    const id = payload.id;
    const reply = (data: object) =>
      deps.postToPage({ type: replyType, data: { id, ...data } });
    const message = {
      ...payload,
      apiUrl: deps.getItem(API_URL_SESSION_STORAGE) ?? undefined,
      projectKey: deps.getItem(PROJECT_KEY_SESSION_STORAGE) ?? undefined,
    };
    if (JSON.stringify(message).length > MAX_PROXY_PAYLOAD_BYTES) {
      reply({
        error: { kind: 'too_large', message: 'request body is too large' },
      });
      return;
    }
    deps.sendToWorker({ type: type!, data: message }).then(
      (result) =>
        reply(
          result && typeof result === 'object'
            ? (result as object)
            : {
                error: {
                  kind: 'unavailable',
                  message: 'the extension did not answer',
                },
              }
        ),
      (e) =>
        reply({
          error: { kind: 'unavailable', message: String(e) },
        })
    );
  };

  const onWorkerMessage = (message: unknown) => {
    const { type, data } = (message ?? {}) as { type?: string; data?: unknown };
    if (type === CAPTURED) {
      deps.postToPage({ type: CAPTURED, data });
    }
  };

  return { onPageMessage, onWorkerMessage };
};
