import { originOf } from '../oauth/url';
import { sessionArea } from '../storageArea';
import { Connection, ProxyResponse } from './proxyTypes';

// Past this age an id is pruned on read rather than kept forever, matching connectRefusalStore.ts's MAX_AGE_MS -
// this matters on the sessionArea() fallback (storage.local, reached below Firefox 115), which nothing else clears.
const MAX_AGE_MS = 60 * 60 * 1000;

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
  const stored = (await sessionArea().get(key))[key] as
    | { at: number }
    | undefined;
  if (!stored) {
    return false;
  }
  if (Date.now() - stored.at > MAX_AGE_MS) {
    await sessionArea().remove(key);
    return false;
  }
  return true;
};

const KEY_PREFIX = 'uploadedImages:';

const imageKey = (connection: Connection, id: string): string =>
  `${KEY_PREFIX}${originOf(connection.apiUrl)}:${connection.projectKey}:${id}`;

export const rememberUploadedImage = async (
  connection: Connection,
  id: string
): Promise<void> => {
  await sessionArea().set({ [imageKey(connection, id)]: { at: Date.now() } });
};
