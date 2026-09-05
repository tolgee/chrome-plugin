import { originOf } from '../oauth/url';
import { sessionArea } from '../storageArea';
import { Connection, ProxyResponse } from './proxyTypes';

const KEY_PREFIX = 'uploadedImages:';

// One storage key per image, not one array shared by every upload for a connection: concurrent uploads (a
// multi-file drop) each set their own key with no read-modify-write, so none can be lost racing another.
const imageKey = (connection: Connection, id: string): string =>
  `${KEY_PREFIX}${originOf(connection.apiUrl)}:${connection.projectKey}:${id}`;

export const rememberUploadedImage = async (
  connection: Connection,
  id: string
): Promise<void> => {
  await sessionArea().set({ [imageKey(connection, id)]: true });
};

export const wasUploadedThroughSession = async (
  connection: Connection,
  id: string
): Promise<boolean> => {
  const key = imageKey(connection, id);
  return Boolean((await sessionArea().get(key))[key]);
};

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
