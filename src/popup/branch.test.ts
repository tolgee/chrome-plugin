import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendToBackground } = vi.hoisted(() => ({ sendToBackground: vi.fn() }));
vi.mock('./sendToBackground', () => ({ sendToBackground }));
vi.mock('./activeTab', () => ({
  getActiveTab: async () => ({ url: 'https://page.example/app' }),
  getActiveTabOrigin: async () => 'https://page.example',
}));

import {
  abbreviateApiKey,
  branchEditorKeyAction,
  branchInEffect,
  fetchBranches,
  pageBranchLabel,
} from './branch';

const branches = [
  { name: 'main', isDefault: true },
  { name: 'feature', isDefault: false },
];

describe('fetchBranches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sendToBackground.mockReset();
  });

  it('lists the project branches through the worker on the signed-in path, never through the popup fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    sendToBackground.mockResolvedValue({
      response: {
        status: 200,
        body: JSON.stringify({ _embedded: { branches } }),
      },
    });

    const result = await fetchBranches(7, {
      apiUrl: 'https://api/',
      oauth: true,
      projectKey: '7',
    });

    expect(result).toEqual(branches);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendToBackground).toHaveBeenCalledWith(
      'TOLGEE_POPUP_API_REQUEST',
      expect.objectContaining({
        path: '/v2/projects/7/branches?size=100',
        method: 'GET',
        apiUrl: 'https://api/',
        projectKey: '7',
        pageOrigin: 'https://page.example',
      })
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
    expect(sendToBackground).not.toHaveBeenCalled();
  });

  it('rejects on a non-ok response from either path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403 }))
    );
    await expect(
      fetchBranches(7, { apiUrl: 'https://api', apiKey: 'tgpak_x' })
    ).rejects.toThrow();

    sendToBackground.mockResolvedValue({
      response: { status: 403, body: '{}' },
    });
    await expect(
      fetchBranches(7, { apiUrl: 'https://api', oauth: true })
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
