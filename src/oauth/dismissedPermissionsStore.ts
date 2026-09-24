import { sessionArea } from '../storageArea';
import { originOf } from './url';

// storage.local stands in for storage.session on old browsers (storageArea.ts), and nothing else clears it there.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'missingPermissionsDismissed:';

type Dismissal = { missing: string; at: number };
type SessionId = { apiUrl: string; projectKey: string | undefined };

const keyFor = ({ apiUrl, projectKey }: SessionId) =>
  `${KEY_PREFIX}${originOf(apiUrl)}:${projectKey ?? ''}`;

export const storeDismissal = (session: SessionId, missing: string[]) =>
  sessionArea().set({
    [keyFor(session)]: {
      missing: missing.join(' '),
      at: Date.now(),
    } satisfies Dismissal,
  });

export const isDismissed = async (
  session: SessionId,
  missing: string[]
): Promise<boolean> =>
  (await loadDismissal(session))?.missing === missing.join(' ');

export const clearDismissal = (session: SessionId) =>
  sessionArea().remove(keyFor(session));

const loadDismissal = async (session: SessionId): Promise<Dismissal | null> => {
  const key = keyFor(session);
  const record = (await sessionArea().get(key))[key] as Dismissal | undefined;
  if (typeof record?.at !== 'number') {
    return null;
  }
  if (record.at <= Date.now() - MAX_AGE_MS) {
    await sessionArea().remove(key);
    return null;
  }
  return record;
};
