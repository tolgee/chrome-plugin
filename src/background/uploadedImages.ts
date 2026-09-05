import { originOf } from '../oauth/url';
import { sessionArea } from '../storageArea';
import { Connection, ProxyResponse } from './proxyTypes';

const KEY_PREFIX = 'uploadedImages:';

const connectionKey = (connection: Connection): string =>
  `${KEY_PREFIX}${originOf(connection.apiUrl)}:${connection.projectKey}`;

const loadIds = async (connection: Connection): Promise<string[]> => {
  const key = connectionKey(connection);
  const stored = (await sessionArea().get(key))[key];
  return Array.isArray(stored) ? (stored as string[]) : [];
};

export const rememberUploadedImage = async (
  connection: Connection,
  id: string
): Promise<void> => {
  const key = connectionKey(connection);
  const ids = new Set(await loadIds(connection));
  ids.add(id);
  await sessionArea().set({ [key]: Array.from(ids) });
};

export const wasUploadedThroughSession = async (
  connection: Connection,
  id: string
): Promise<boolean> => (await loadIds(connection)).includes(id);

// Shared by both upload paths that create an image through the proxy: a screenshot capture and a plain relayed
// POST /v2/image-upload.
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
