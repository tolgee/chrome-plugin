import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  abbreviateApiKey,
  branchEditorKeyAction,
  branchInEffect,
  credentialHeaders,
  fetchBranches,
  pageBranchLabel,
} from './branch';

const branches = [
  { name: 'main', isDefault: true },
  { name: 'feature', isDefault: false },
];

describe('credentialHeaders', () => {
  it('uses the bearer token for an OAuth session', () => {
    expect(
      credentialHeaders({ apiUrl: 'https://api', authToken: 'jwt' })
    ).toEqual({ Authorization: 'Bearer jwt' });
  });

  it('uses the api key header for a key session', () => {
    expect(
      credentialHeaders({ apiUrl: 'https://api', apiKey: 'tgpak_x' })
    ).toEqual({ 'X-API-Key': 'tgpak_x' });
  });
});

describe('fetchBranches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the project branches with the session bearer token on the OAuth path', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ _embedded: { branches } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBranches(7, {
      apiUrl: 'https://api/',
      authToken: 'jwt',
    });

    expect(result).toEqual(branches);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api/v2/projects/7/branches?size=100',
      { headers: { Authorization: 'Bearer jwt' } }
    );
  });

  it('lists with the api key on the key path', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBranches(7, {
      apiUrl: 'https://api',
      apiKey: 'tgpak_x',
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api/v2/projects/7/branches?size=100',
      { headers: { 'X-API-Key': 'tgpak_x' } }
    );
  });

  it('rejects on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403 }))
    );
    await expect(
      fetchBranches(7, { apiUrl: 'https://api', authToken: 'jwt' })
    ).rejects.toThrow();
  });
});

describe('branch labels', () => {
  it('shows the override when set, else the page branch, else the default branch', () => {
    expect(branchInEffect('feature', 'main', branches)).toBe('feature');
    expect(branchInEffect('', 'main', branches)).toBe('main');
    expect(branchInEffect(undefined, undefined, branches)).toBe('main');
  });

  it('falls back to a generic label when no branch is known', () => {
    expect(pageBranchLabel(undefined, null)).toBe('Default branch');
    expect(pageBranchLabel(undefined, [{ name: 'x', isDefault: false }])).toBe(
      'Default branch'
    );
  });
});

describe('branchEditorKeyAction', () => {
  it('commits on Enter when nothing is highlighted', () => {
    expect(branchEditorKeyAction('Enter', false)).toBe('commit');
  });

  it('leaves Enter to the Autocomplete when an option is highlighted', () => {
    expect(branchEditorKeyAction('Enter', true)).toBeNull();
  });

  it('cancels on Escape', () => {
    expect(branchEditorKeyAction('Escape', false)).toBe('cancel');
    expect(branchEditorKeyAction('Escape', true)).toBe('cancel');
  });

  it('ignores other keys', () => {
    expect(branchEditorKeyAction('a', false)).toBeNull();
    expect(branchEditorKeyAction('Tab', false)).toBeNull();
  });
});

describe('abbreviateApiKey', () => {
  it('keeps the prefix and suffix of a long key', () => {
    expect(
      abbreviateApiKey('tgpak_gmzdmmzyl5xde2jzm5xgezdcgf2han3jgnutm')
    ).toBe('tgpak_gmzd…gnutm');
  });

  it('leaves a short key as is', () => {
    expect(abbreviateApiKey('tgpak_short')).toBe('tgpak_short');
  });
});
