import { originOf } from '../oauth/url';
import { Connection, ProxyResponse } from './proxyTypes';

// The platform scopes an uploaded image to the uploading user's account, not to any project (V2ImageUploadController
// has no project param on upload, and delete only checks the account) - so there is no projectKey to pin a DELETE
// against. Pinning instead to ids uploaded through this same worker session narrows a proxied DELETE to images the
// page's own session actually created. In-memory only: losing this on a worker restart just refuses DELETE for
// images uploaded before the restart, which is a safe failure direction, not a regression.
const uploadedIds = new Map<string, Set<string>>();

const connectionKey = (connection: Connection): string =>
  `${originOf(connection.apiUrl)}:${connection.projectKey}`;

export const rememberUploadedImage = (
  connection: Connection,
  id: string
): void => {
  const key = connectionKey(connection);
  const ids = uploadedIds.get(key) ?? new Set<string>();
  ids.add(id);
  uploadedIds.set(key, ids);
};

export const wasUploadedThroughSession = (
  connection: Connection,
  id: string
): boolean => uploadedIds.get(connectionKey(connection))?.has(id) ?? false;

// Shared by both upload paths that create an image through the proxy (the screenshot capture flow and a plain
// POST /v2/image-upload relayed from the page), so a later DELETE of either kind of upload is recognised.
export const rememberUploadIfSuccessful = (
  connection: Connection,
  response: ProxyResponse
): void => {
  if (response.status < 200 || response.status >= 300) {
    return;
  }
  try {
    const id = JSON.parse(response.body)?.id;
    if (id !== undefined && id !== null) {
      rememberUploadedImage(connection, String(id));
    }
  } catch {
    // Not JSON or no id: nothing to remember, a later DELETE for it is simply refused.
  }
};
