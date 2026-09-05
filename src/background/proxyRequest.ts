import { normalizeUrl } from '../oauth/url';
import { ProxyBody } from '../protocol';
import { Connection, failure, ProxyFailure } from './proxyTypes';
import { wasUploadedThroughSession } from './uploadedImages';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOWED_HEADERS = [
  'content-type',
  'accept',
  'x-tolgee-sdk-type',
  'x-tolgee-sdk-version',
];
const PERMISSIONS_PATH = '/v2/api-keys/current-permissions';
export const IMAGE_UPLOAD_PATH = '/v2/image-upload';

export type ResolvedTarget = { method: string; pathWithQuery: string };

export type TargetResolver = (
  method: string,
  path: string,
  connection: Connection
) => ResolvedTarget | ProxyFailure;

export const resolveTabTarget: TargetResolver = (method, path, connection) => {
  const resolved = resolveWithinServer(method, path, connection);
  if ('error' in resolved) {
    return resolved;
  }
  if (!isAllowedPath(resolved.apiPath, resolved.method, connection)) {
    return failure('not_allowed', `${resolved.apiPath} is not proxied`);
  }
  if (resolved.apiPath === PERMISSIONS_PATH) {
    const search = pinnedPermissionsQuery(
      resolved.search,
      connection.projectKey
    );
    return 'error' in search
      ? search
      : withQuery({ ...resolved, search: search.search });
  }
  return withQuery(resolved);
};

export const resolvePopupTarget: TargetResolver = (
  method,
  path,
  connection
) => {
  const resolved = resolveWithinServer(method, path, connection);
  return 'error' in resolved ? resolved : withQuery(resolved);
};

// The permissions endpoint names its project in the query, not the path: pinned here like the path prefix is.
const pinnedPermissionsQuery = (
  search: string,
  projectKey: string
): { search: string } | ProxyFailure => {
  const params = new URLSearchParams(search);
  const requested = params.get('projectId');
  if (requested !== null && requested !== projectKey) {
    return failure(
      'not_allowed',
      `permissions for project ${requested} are not proxied`
    );
  }
  params.set('projectId', projectKey);
  return { search: `?${params.toString()}` };
};

const withQuery = (resolved: {
  method: string;
  apiPath: string;
  search: string;
}): ResolvedTarget => ({
  method: resolved.method,
  pathWithQuery: resolved.apiPath + resolved.search,
});

const resolveWithinServer = (
  method: string,
  path: string,
  connection: Connection
): { method: string; apiPath: string; search: string } | ProxyFailure => {
  const upper = String(method).toUpperCase();
  if (!ALLOWED_METHODS.includes(upper)) {
    return failure('not_allowed', `method ${method} is not proxied`);
  }
  let base: URL;
  let url: URL;
  try {
    base = new URL(normalizeUrl(connection.apiUrl) + '/');
    url = new URL(String(path).replace(/^\/+/, ''), base);
  } catch {
    return failure('not_allowed', `cannot resolve ${path}`);
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    return failure('not_allowed', `${path} leaves the Tolgee server`);
  }
  const leadingSlash = 1;
  const apiPath = url.pathname.slice(base.pathname.length - leadingSlash);
  return { method: upper, apiPath, search: url.search };
};

const isAllowedPath = (
  pathname: string,
  method: string,
  connection: Connection
): boolean => {
  if (pathname === IMAGE_UPLOAD_PATH) {
    return true;
  }
  if (pathname.startsWith(`${IMAGE_UPLOAD_PATH}/`)) {
    return method !== 'DELETE' || deletesOnlyOwnUploads(pathname, connection);
  }
  return (
    pathname === PERMISSIONS_PATH ||
    pathname.startsWith(`/v2/projects/${connection.projectKey}/`)
  );
};

// Image uploads aren't project-scoped on the platform (see uploadedImages.ts), so a proxied DELETE is pinned here
// instead to ids this same worker session uploaded through the screenshot capture path.
const deletesOnlyOwnUploads = (
  pathname: string,
  connection: Connection
): boolean => {
  const ids = pathname.slice(`${IMAGE_UPLOAD_PATH}/`.length).split(',');
  return (
    ids.length > 0 &&
    ids.every((id) => id && wasUploadedThroughSession(connection, id))
  );
};

export const allowedHeaders = (
  headers: Record<string, string> | undefined
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) =>
      ALLOWED_HEADERS.includes(name.toLowerCase())
    )
  );

export const buildBody = (
  body: ProxyBody | undefined
): BodyInit | undefined => {
  if (!body || body.kind === 'none') {
    return undefined;
  }
  if (body.kind === 'json') {
    return body.text;
  }
  const form = new FormData();
  for (const entry of body.entries) {
    if ('file' in entry) {
      form.append(
        entry.name,
        new Blob([decodeBase64(entry.file.base64)], { type: entry.file.type }),
        entry.file.name
      );
    } else {
      form.append(entry.name, entry.value);
    }
  }
  return form;
};

const decodeBase64 = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
