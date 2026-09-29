import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendToBackground, loadValues, sessionStore } = vi.hoisted(() => ({
  sendToBackground: vi.fn(),
  loadValues: vi.fn(),
  sessionStore: new Map<string, unknown>(),
}));
vi.mock('./sendToBackground', () => ({ sendToBackground }));
vi.mock('./storage', () => ({ loadValues }));
vi.mock('./activeTab', () => ({
  getActiveTabOrigin: async () => 'https://page.example',
}));
vi.mock('../storageArea', () => ({
  sessionArea: () => ({
    get: async (key: string) =>
      sessionStore.has(key) ? { [key]: sessionStore.get(key) } : {},
    set: async (obj: Record<string, unknown>) => {
      Object.entries(obj).forEach(([k, v]) => sessionStore.set(k, v));
    },
    remove: async (key: string) => {
      sessionStore.delete(key);
    },
  }),
}));

import {
  dismissMissingPermissions,
  forgetDismissal,
  missingPermissionsToShow,
  reauthorizeThenRecheck,
} from './missingPermissions';

const LOCATOR = {
  apiUrl: 'https://app.tolgee.io',
  projectKey: '7',
  pageOrigin: 'https://page.example',
};
const signedIn = (projectKey = '7') =>
  loadValues.mockResolvedValue({
    apiUrl: LOCATOR.apiUrl,
    oauth: true,
    projectKey,
  });
const workerSays = (missing: string[]) =>
  sendToBackground.mockImplementation(async (type: string) =>
    type === 'OAUTH_REAUTHORIZE' ? {} : { missing }
  );

afterEach(() => {
  sendToBackground.mockReset();
  loadValues.mockReset();
  sessionStore.clear();
  vi.useRealTimers();
});

describe('missingPermissionsToShow', () => {
  it("is the worker's list for the stored session", async () => {
    signedIn();
    workerSays(['translations.edit']);

    expect(await missingPermissionsToShow()).toEqual(['translations.edit']);
    expect(sendToBackground).toHaveBeenCalledWith(
      'OAUTH_MISSING_PERMISSIONS',
      LOCATOR
    );
  });

  it('is empty, without asking, when no OAuth session is stored', async () => {
    loadValues.mockResolvedValue({ apiUrl: LOCATOR.apiUrl, apiKey: 'tgpak_x' });

    expect(await missingPermissionsToShow()).toEqual([]);
    expect(sendToBackground).not.toHaveBeenCalled();
  });

  it('stays empty once that same list was dismissed, and comes back when the list changes', async () => {
    signedIn();
    workerSays(['translations.edit']);
    await dismissMissingPermissions(['translations.edit']);

    expect(await missingPermissionsToShow()).toEqual([]);

    workerSays(['translations.edit', 'keys.edit']);
    expect(await missingPermissionsToShow()).toEqual([
      'translations.edit',
      'keys.edit',
    ]);
  });

  it('keeps a dismissal to the session it was made for', async () => {
    signedIn('7');
    workerSays(['translations.edit']);
    await dismissMissingPermissions(['translations.edit']);

    signedIn('8');
    expect(await missingPermissionsToShow()).toEqual(['translations.edit']);
  });

  it('forgets a dismissal after a day, where storage.local stands in for storage.session', async () => {
    vi.useFakeTimers();
    signedIn();
    workerSays(['translations.edit']);
    await dismissMissingPermissions(['translations.edit']);

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(await missingPermissionsToShow()).toEqual(['translations.edit']);
  });

  it('forgets a dismissal with the grant it was made for (sign-out, fresh sign-in)', async () => {
    signedIn();
    workerSays(['translations.edit']);
    await dismissMissingPermissions(['translations.edit']);

    await forgetDismissal();

    expect(await missingPermissionsToShow()).toEqual(['translations.edit']);
  });
});

describe('reauthorizeThenRecheck', () => {
  it("answers with the worker's list asked after the sign-in", async () => {
    signedIn();
    workerSays(['translations.edit']);

    expect(await reauthorizeThenRecheck()).toEqual(['translations.edit']);
    expect(sendToBackground.mock.calls.map(([type]) => type)).toEqual([
      'OAUTH_REAUTHORIZE',
      'OAUTH_MISSING_PERMISSIONS',
    ]);
  });

  it('drops the dismissal made for the grant the sign-in replaced', async () => {
    signedIn();
    workerSays(['translations.edit']);
    await dismissMissingPermissions(['translations.edit']);

    expect(await reauthorizeThenRecheck()).toEqual(['translations.edit']);
  });
});
