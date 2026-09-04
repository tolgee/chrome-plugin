// The platform issues opaque access tokens (no embedded project claim, see docs/oauth/README.md "Opaque access
// tokens"), so the session/marker key is the project id requested at connect time, not anything read off the token.
// The page's own *declared* project (PROJECT_ID_SESSION_STORAGE / Values.projectId / libConfig) is a separate,
// independently-changeable value and must never be used as a stand-in for this key.
export const projectKeyFor = (projectId: number | string): string =>
  String(projectId);

export const servesSameProject = (
  projectKey: string,
  pageProjectKey: string | null
): boolean => pageProjectKey !== null && projectKey === pageProjectKey;

// A 403/404 on a project lookup with a still-valid access token is the platform saying outright that the token
// cannot reach that project. Anything else (5xx, a network failure) is inconclusive and must not be treated the
// same way — an outage is not proof the token is broken.
export const confirmsProjectInaccessible = (status: number): boolean =>
  status === 403 || status === 404;

// A 401 on an otherwise-locally-fresh token means the grant itself is gone server-side (revoked, signed out
// everywhere, password changed) — distinct from confirmsProjectInaccessible, which is about a live token reaching
// the wrong project.
export const confirmsTokenUnusable = (status: number): boolean =>
  status === 401;
