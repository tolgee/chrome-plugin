import { originOf } from '../oauth/url';
import { sessionArea } from '../storageArea';
import { Connection, ProxyResponse } from './proxyTypes';

// Swept on write, never on read: expiring on read would shorten the DELETE grant itself, so a dialog left open
// could no longer clean up its own uploads. Bounds the sessionArea() fallback (storage.local, below Firefox 115),
// which nothing else clears. A day is far longer than any dialog session.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const rememberUploadIfSuccessful = async (
  connection: Connection,
  response: ProxyResponse
): Promise<void> => {
  if (response.status < 200 || response.status >= 300) {
    return;
  }
  try {
    const id = JSON.parse(response.body)?.id;
    if (id !== undefined && id !== null) {
      await rememberUploadedImage(connection, String(id));
    }
  } catch {
    // Not JSON or no id: nothing to remember, a later DELETE for it is simply refused.
  }
};

export const wasUploadedThroughSession = async (
  connection: Connection,
  id: string
): Promise<boolean> => {
  const key = imageKey(connection, id);
  return Boolean((await sessionArea().get(key))[key]);
};

export const rememberUploadedImage = async (
  connection: Connection,
  id: string
): Promise<void> => {
  await sweepExpired();
  await sessionArea().set({ [imageKey(connection, id)]: { at: Date.now() } });
};

const KEY_PREFIX = 'uploadedImages:';

const imageKey = (connection: Connection, id: string): string =>
  `${KEY_PREFIX}${originOf(connection.apiUrl)}:${connection.projectKey}:${id}`;

const sweepExpired = async (): Promise<void> => {
  const cutoff = Date.now() - MAX_AGE_MS;
  const all = await sessionArea().get(null);
  const stale = Object.entries(all)
    .filter(
      ([key, value]) =>
        key.startsWith(KEY_PREFIX) &&
        ((value as { at?: number } | null)?.at ?? 0) <= cutoff
    )
    .map(([key]) => key);
  if (stale.length > 0) {
    await sessionArea().remove(stale);
  }
};
