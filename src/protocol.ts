// Mirror of tolgee-js packages/web/src/package/tools/extensionProtocol.ts: the two repos release independently,
// so every value here has to stay compatible with what shipped SDKs expect.

// Reported in TOLGEE_PONG and TOLGEE_READY. 2 = the SDK sends its Tolgee API requests through the extension (no
// credential in the page).
export const PROTOCOL_VERSION = 2;

// The oldest page protocol the worker still proxies for; a future PROTOCOL_VERSION bump (e.g. an unrelated new
// message) must not by itself make an already-deployed protocol-2 SDK look too old for proxying.
export const MIN_PROXY_PROTOCOL_VERSION = 2;

// An SDK that reports no version predates the handshake field, so it speaks protocol 1.
export const supportsProxy = (protocolVersion: number | undefined): boolean =>
  (protocolVersion ?? 1) >= MIN_PROXY_PROTOCOL_VERSION;

// Must stay under the SDK's EXTENSION_REQUEST_TIMEOUT_MS: a caller that has given up could otherwise still get a
// reply.
export const PROXY_BUDGET_MS = 30_000;

export type SessionKind = 'oauth' | 'apiKey';

export const sessionKindOf = (
  value: string | null | undefined
): SessionKind | null =>
  value === 'oauth' || value === 'apiKey' ? value : null;

// The worker's answer kinds when it cannot produce an HTTP response.
export type ProxyErrorKind =
  | 'no_session'
  | 'not_allowed'
  | 'too_large'
  | 'network'
  | 'timeout'
  | 'unavailable';

export type FormEntry =
  | { name: string; value: string }
  | { name: string; file: { name: string; type: string; base64: string } };

export type ProxyBody =
  | { kind: 'none' }
  | { kind: 'json'; text: string }
  | { kind: 'form'; entries: FormEntry[] };
