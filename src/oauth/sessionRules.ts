import { ProxyErrorKind } from '../protocol';

// The platform issues opaque access tokens (no embedded project claim, see docs/oauth/README.md "Opaque access
// tokens"), so the session/connection key is the project id requested at connect time, not anything read off the token.
export const projectKeyFor = (projectId: number | string): string =>
  String(projectId);

// The platform answers a project id that does not exist with this code and a 400, not a 404: its project
// interceptor leaves a missing project unset and the controller then finds no project selected.
export const PROJECT_NOT_SELECTED = 'project_not_selected';

// A 403/404 on a project lookup with a still-valid access token is the platform saying outright that the token
// cannot reach that project.
export const confirmsProjectInaccessible = (
  status: number,
  code?: string | null
): boolean =>
  status === 403 ||
  status === 404 ||
  (status === 400 && code === PROJECT_NOT_SELECTED);

/** The platform's error `code` from a failed response body, if it carries one. */
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

// A 401 on an otherwise-locally-fresh token means the grant itself is gone server-side (revoked, signed out
// everywhere, password changed).
export const confirmsTokenUnusable = (status: number): boolean =>
  status === 401;

// The platform answers a key it does not accept with one of these; anything else says nothing about the key. A 400
// is among them because a malformed key never reaches authentication.
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
