import { ProxyErrorKind } from '../protocol';

// See docs/oauth/README.md "Opaque access tokens".
export const projectKeyFor = (projectId: number | string): string =>
  String(projectId);

// The platform answers a project id that does not exist with this code and a 400, not a 404.
export const PROJECT_NOT_SELECTED = 'project_not_selected';

export const confirmsProjectInaccessible = (
  status: number,
  code?: string | null
): boolean =>
  status === 403 ||
  status === 404 ||
  (status === 400 && code === PROJECT_NOT_SELECTED);

export const errorCodeOf = async (response: {
  json(): Promise<unknown>;
}): Promise<string | undefined> => {
  try {
    const body = (await response.json()) as { code?: unknown } | null;
    return typeof body?.code === 'string' ? body.code : undefined;
  } catch {
    return undefined;
  }
};

export const confirmsTokenUnusable = (status: number): boolean =>
  status === 401;

// A malformed key is answered 400, since it never reaches authentication.
export const confirmsKeyUnusable = (status: number): boolean =>
  status === 400 || status === 401 || status === 403;

const INCONCLUSIVE_PROXY_ERROR_KIND: Record<ProxyErrorKind, boolean> = {
  no_session: false,
  not_allowed: false,
  too_large: false,
  network: true,
  timeout: true,
  unavailable: true,
};

export const isInconclusiveProxyErrorKind = (kind: ProxyErrorKind): boolean =>
  INCONCLUSIVE_PROXY_ERROR_KIND[kind];
