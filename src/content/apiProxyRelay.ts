import {
  API_URL_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../sessionStorageKeys';
import { PROTOCOL_VERSION } from '../protocol';

export const MAX_PROXY_PAYLOAD_BYTES = 20 * 1024 * 1024;

// No prototype, so a page message claiming type 'constructor'/'__proto__'/'hasOwnProperty' looks up nothing rather
// than an inherited Object method.
const RELAYED: Record<string, string> = Object.assign(Object.create(null), {
  TOLGEE_API_REQUEST: 'TOLGEE_API_RESPONSE',
  TOLGEE_SCREENSHOT_UPLOAD: 'TOLGEE_SCREENSHOT_UPLOADED',
});
const CAPTURED = 'TOLGEE_SCREENSHOT_CAPTURED';
const PING = 'TOLGEE_PROXY_PING';
const PONG = 'TOLGEE_PROXY_PONG';
const TOO_LARGE = {
  error: { kind: 'too_large', message: 'request body is too large' },
};
const NO_ANSWER = {
  error: { kind: 'unavailable', message: 'the extension did not answer' },
};

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

export const createApiProxyRelay = (deps: RelayDeps, self: unknown) => {
  const onPageMessage = (event: PageMessageEvent) => {
    if (event.source !== self || event.origin !== deps.origin) {
      return;
    }
    const type = event.data?.type;
    if (type === PING) {
      deps.postToPage({
        type: PONG,
        data: { protocolVersion: PROTOCOL_VERSION },
      });
      return;
    }
    if (!type) {
      return;
    }
    const replyType = RELAYED[type];
    const payload = event.data?.data as { id?: unknown } | undefined;
    if (!replyType || typeof payload?.id !== 'string') {
      return;
    }
    const id = payload.id;
    const message = {
      ...payload,
      apiUrl: deps.getItem(API_URL_SESSION_STORAGE) ?? undefined,
      projectKey: deps.getItem(PROJECT_KEY_SESSION_STORAGE) ?? undefined,
    };
    forwardToWorker(type, message, (data) =>
      deps.postToPage({ type: replyType, data: { id, ...data } })
    );
  };

  const forwardToWorker = (
    type: string,
    message: object,
    reply: (data: object) => void
  ) => {
    if (
      new TextEncoder().encode(JSON.stringify(message)).length >
      MAX_PROXY_PAYLOAD_BYTES
    ) {
      reply(TOO_LARGE);
      return;
    }
    deps.sendToWorker({ type, data: message }).then(
      (result) =>
        reply(
          result && typeof result === 'object' ? (result as object) : NO_ANSWER
        ),
      (e) => reply({ error: { kind: 'unavailable', message: String(e) } })
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
