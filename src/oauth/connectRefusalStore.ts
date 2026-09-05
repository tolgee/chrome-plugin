import { sessionArea } from '../storageArea';
import { ConnectRefusal, isProjectInaccessibleRefusal } from './connectRefusal';

// launchWebAuthFlow closes the action popup, so the OAUTH_LOGIN reply carrying a refusal is usually never received:
// the outcome is parked per page origin until the next attempt starts, the user dismisses it, or it goes stale.
export type StoredConnectRefusal = ConnectRefusal & { at: number };

// A refusal older than this says nothing about the session the user is about to start.
const MAX_AGE_MS = 60 * 60 * 1000;

const KEY_PREFIX = 'connectRefusal:';

const keyFor = (origin: string) => `${KEY_PREFIX}${origin}`;

export const storeConnectRefusal = (
  origin: string,
  refusal: ConnectRefusal
): Promise<void> =>
  sessionArea().set({
    [keyFor(origin)]: { ...refusal, at: Date.now() } as StoredConnectRefusal,
  });

export const loadConnectRefusal = async (
  origin: string | undefined
): Promise<StoredConnectRefusal | null> => {
  if (!origin) {
    return null;
  }
  const key = keyFor(origin);
  const stored = (await sessionArea().get(key))[key] as unknown;
  const refusal =
    isProjectInaccessibleRefusal(stored) &&
    typeof (stored as StoredConnectRefusal).at === 'number'
      ? (stored as StoredConnectRefusal)
      : null;
  if (!refusal) {
    return null;
  }
  if (Date.now() - refusal.at > MAX_AGE_MS) {
    await clearConnectRefusal(origin);
    return null;
  }
  return refusal;
};

export const clearConnectRefusal = (origin: string): Promise<void> =>
  sessionArea().remove(keyFor(origin));
