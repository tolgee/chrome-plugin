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
  userFullName: 'Demo User',
  branchingEnabled: false,
};

describe('runCredentialsCheck', () => {
  it('reports loading, then the result, for a conclusive answer', async () => {
    checkApiKey.mockResolvedValue(PROJECT);
    const set = vi.fn();

    await runCredentialsCheck(KEY, null, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', PROJECT]);
  });

  it('reports invalid on a confirmed rejection (a plain Error from checkApiKey/checkOAuthSession)', async () => {
    checkApiKey.mockRejectedValue(new Error('Invalid API key'));
    const set = vi.fn();

    await runCredentialsCheck(KEY, PROJECT, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', 'invalid']);
  });

  it('a connected session on a 5xx (InconclusiveHttpStatus) is restored to what it held before this check ran, not left at loading', async () => {
    checkApiKey.mockRejectedValue(
      new InconclusiveHttpStatus(500, '/v2/api-keys/current')
    );
    const set = vi.fn();

    await runCredentialsCheck(KEY, PROJECT, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', PROJECT]);
  });

  it('a connected session on a network/timeout/unavailable proxy failure is restored, not left at loading', async () => {
    checkOAuthSession.mockRejectedValue(
      new ProxyFetchError('unavailable', 'the extension did not answer')
    );
    const set = vi.fn();

    await runCredentialsCheck(OAUTH, PROJECT, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', PROJECT]);

    checkOAuthSession.mockRejectedValue(new ProxyFetchError('network', 'x'));
    set.mockClear();
    await runCredentialsCheck(OAUTH, PROJECT, set);
    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', PROJECT]);

    checkOAuthSession.mockRejectedValue(new ProxyFetchError('timeout', 'x'));
    set.mockClear();
    await runCredentialsCheck(OAUTH, PROJECT, set);
    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', PROJECT]);
  });

  it('an inconclusive answer with nothing held before it just clears the loading state back to null', async () => {
    checkApiKey.mockRejectedValue(
      new InconclusiveHttpStatus(500, '/v2/api-keys/current')
    );
    const set = vi.fn();

    await runCredentialsCheck(KEY, null, set);

    expect(set.mock.calls.map((c) => c[0])).toEqual(['loading', null]);
  });
});
