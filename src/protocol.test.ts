import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, PROXY_BUDGET_MS } from './protocol';

// Pinned: tolgee-js packages/web/src/package/tools/extensionProtocol.ts carries the mirror values, and shipped SDKs
// wait EXTENSION_REQUEST_TIMEOUT_MS (35 s) for a reply.
describe('extension protocol', () => {
  it('speaks protocol 2', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it("answers within the SDK's request timeout", () => {
    const SDK_REQUEST_TIMEOUT_MS = 35_000;
    expect(PROXY_BUDGET_MS).toBe(30_000);
    expect(SDK_REQUEST_TIMEOUT_MS).toBeGreaterThan(PROXY_BUDGET_MS);
  });
});
