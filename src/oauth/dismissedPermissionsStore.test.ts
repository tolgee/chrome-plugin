import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        get: async (key: string) =>
          store.has(key) ? { [key]: store.get(key) } : {},
        set: async (obj: Record<string, unknown>) => {
          Object.entries(obj).forEach(([k, v]) => store.set(k, v));
        },
        remove: async (key: string) => {
          store.delete(key);
        },
      },
    },
  },
}));

import {
  clearDismissal,
  isDismissed,
  storeDismissal,
} from './dismissedPermissionsStore';

const SESSION = { apiUrl: 'https://app.tolgee.io/', projectKey: '7' };

describe('dismissedPermissionsStore', () => {
  beforeEach(() => {
    store.clear();
    vi.useRealTimers();
  });

  it('stores one record per server origin and project, keyed like the other session-area stores', async () => {
    await storeDismissal(SESSION, ['translations.edit']);

    expect([...store.keys()]).toEqual([
      'missingPermissionsDismissed:https://app.tolgee.io:7',
    ]);
    expect(await isDismissed(SESSION, ['translations.edit'])).toBe(true);
    expect(
      await isDismissed({ ...SESSION, projectKey: '8' }, ['translations.edit'])
    ).toBe(false);
  });

  it('answers for that list only, and never for an empty one', async () => {
    await storeDismissal(SESSION, ['translations.edit']);

    expect(await isDismissed(SESSION, ['translations.edit', 'keys.edit'])).toBe(
      false
    );
    expect(await isDismissed(SESSION, [])).toBe(false);
  });

  it('forgets a record after a day', async () => {
    vi.useFakeTimers();
    await storeDismissal(SESSION, ['translations.edit']);
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(await isDismissed(SESSION, ['translations.edit'])).toBe(false);
    expect(store.size).toBe(0);
  });

  it('clears the record for that session alone', async () => {
    await storeDismissal(SESSION, ['translations.edit']);
    await storeDismissal({ ...SESSION, projectKey: '8' }, ['keys.edit']);

    await clearDismissal(SESSION);

    expect(await isDismissed(SESSION, ['translations.edit'])).toBe(false);
    expect(
      await isDismissed({ ...SESSION, projectKey: '8' }, ['keys.edit'])
    ).toBe(true);
  });
});
