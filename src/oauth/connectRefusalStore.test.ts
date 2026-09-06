import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = new Map<string, unknown>();
const local = new Map<string, unknown>();
const areaOver = (store: Map<string, unknown>) => ({
  get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
  set: async (obj: Record<string, unknown>) =>
    Object.entries(obj).forEach(([k, v]) => store.set(k, v)),
  remove: async (key: string) => {
    store.delete(key);
  },
});
const storage: { session?: unknown; local: unknown } = {
  session: areaOver(session),
  local: areaOver(local),
};
vi.mock('webextension-polyfill', () => ({ default: { storage } }));

const { clearConnectRefusal, loadConnectRefusal, storeConnectRefusal } =
  await import('./connectRefusalStore');

const ORIGIN = 'https://site.example';
const refusal = {
  code: 'project_inaccessible' as const,
  projectId: 7,
  apiUrl: 'https://app.tolgee.io',
};

describe('connect refusal store', () => {
  beforeEach(() => {
    session.clear();
    local.clear();
    storage.session = areaOver(session);
  });

  it('round-trips a refusal for an origin, stamped with when it happened', async () => {
    await storeConnectRefusal(ORIGIN, refusal);
    expect(await loadConnectRefusal(ORIGIN)).toEqual({
      ...refusal,
      at: expect.any(Number),
    });
    expect(await loadConnectRefusal('https://other.example')).toBeNull();
    expect(await loadConnectRefusal(undefined)).toBeNull();
  });

  it('keeps the outcome in the session area, which the browser drops on exit', async () => {
    await storeConnectRefusal(ORIGIN, refusal);
    expect(session.size).toBe(1);
    expect(local.size).toBe(0);
  });

  it('falls back to the local area on a browser without storage.session', async () => {
    storage.session = undefined;
    await storeConnectRefusal(ORIGIN, refusal);
    expect(local.size).toBe(1);
    expect(await loadConnectRefusal(ORIGIN)).toMatchObject(refusal);
    await clearConnectRefusal(ORIGIN);
    expect(local.size).toBe(0);
  });

  it('clears one origin without touching another', async () => {
    await storeConnectRefusal(ORIGIN, refusal);
    await storeConnectRefusal('https://other.example', refusal);
    await clearConnectRefusal(ORIGIN);
    expect(await loadConnectRefusal(ORIGIN)).toBeNull();
    expect(await loadConnectRefusal('https://other.example')).not.toBeNull();
  });

  it('drops a refusal older than an hour, which says nothing about the attempt about to start', async () => {
    const key = `connectRefusal:${ORIGIN}`;
    session.set(key, { ...refusal, at: Date.now() - 61 * 60 * 1000 });

    expect(await loadConnectRefusal(ORIGIN)).toBeNull();
    expect(session.has(key)).toBe(false);
  });

  it('keeps a refusal that is still fresh', async () => {
    session.set(`connectRefusal:${ORIGIN}`, {
      ...refusal,
      at: Date.now() - 59 * 60 * 1000,
    });

    expect(await loadConnectRefusal(ORIGIN)).toMatchObject(refusal);
  });

  it('ignores a record that is not a refusal', async () => {
    session.set(`connectRefusal:${ORIGIN}`, { code: 'something_else' });
    expect(await loadConnectRefusal(ORIGIN)).toBeNull();
  });
});
