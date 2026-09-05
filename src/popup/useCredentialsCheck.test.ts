import { describe, expect, it, vi } from 'vitest';

const { checkApiKey, checkOAuthSession } = vi.hoisted(() => ({
  checkApiKey: vi.fn(),
  checkOAuthSession: vi.fn(),
}));
vi.mock('./credentialsCheck', () => ({ checkApiKey, checkOAuthSession }));

// Pulled in transitively via popupState.ts -> oauth/connectRefusalStore.ts -> storageArea.ts.
vi.mock('webextension-polyfill', () => ({
  default: { storage: { session: undefined, local: {} } },
}));

import { runCredentialsCheck } from './useCredentialsCheck';
import { InconclusiveHttpStatus, ProxyFetchError } from './proxyFetch';

const KEY = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' };
const OAUTH = { apiUrl: 'https://app.tolgee.io', oauth: true };

const PROJECT: import('./popupState').ProjectInfo = {
  projectName: 'Demo',
  projectId: 1,
  scopes: [],
  branchingEnabled: false,
};

describe('runCredentialsCheck', () => {
  it('clears the previous verdict, then reports the result, for a conclusive answer', async () => {
    checkApiKey.mockResolvedValue(PROJECT);
    const set = vi.fn();

    await runCredentialsCheck(KEY, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual([null, PROJECT]);
  });

  it('reports invalid on a confirmed rejection (a plain Error from checkApiKey/checkOAuthSession)', async () => {
    checkApiKey.mockRejectedValue(new Error('Invalid API key'));
    const set = vi.fn();

    await runCredentialsCheck(KEY, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual([null, 'invalid']);
  });

  it('a 5xx (InconclusiveHttpStatus) clears to null rather than reporting invalid', async () => {
    checkApiKey.mockRejectedValue(
      new InconclusiveHttpStatus(500, '/v2/api-keys/current')
    );
    const set = vi.fn();

    await runCredentialsCheck(KEY, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual([null, null]);
  });

  it('a network/timeout/unavailable proxy failure clears to null rather than reporting invalid', async () => {
    checkOAuthSession.mockRejectedValue(
      new ProxyFetchError('unavailable', 'the extension did not answer')
    );
    const set = vi.fn();

    await runCredentialsCheck(OAUTH, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual([null, null]);

    checkOAuthSession.mockRejectedValue(new ProxyFetchError('network', 'x'));
    set.mockClear();
    await runCredentialsCheck(OAUTH, set);
    expect(set.mock.calls.map((c) => c[0])).toEqual([null, null]);

    checkOAuthSession.mockRejectedValue(new ProxyFetchError('timeout', 'x'));
    set.mockClear();
    await runCredentialsCheck(OAUTH, set);
    expect(set.mock.calls.map((c) => c[0])).toEqual([null, null]);
  });
});
