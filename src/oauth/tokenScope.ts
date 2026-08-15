// Reads the `tg.prj` (project set) claim the backend stamped into the OAuth access token. '*' means all projects
// (the user must then pick one to edit); a single id means the token is bound to that project and we can auto-select it.
export function decodeTokenProjectSet(
  token: string | undefined
): '*' | number[] | undefined {
  if (!token) {
    return undefined;
  }
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    const prj = payload['tg.prj'];
    if (prj === '*') {
      return '*';
    }
    if (Array.isArray(prj)) {
      return prj.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    }
    return undefined;
  } catch (e) {
    return undefined;
  }
}

export const ALL_PROJECTS_KEY = '*';

// The store key for a token's project scope: the single bound project id, or '*' for an all-projects token. Keying a
// concrete-project token by its id lets two projects on the same backend coexist instead of overwriting each other;
// an all-projects token keys as '*' so it's reused for any project. A multi-project set (the extension never mints one)
// keys by its sorted ids, which no single-project lookup matches — so it is simply never reused, never mis-served.
export function projectKeyForToken(token: string): string {
  const scope = decodeTokenProjectSet(token);
  if (scope === '*') {
    return ALL_PROJECTS_KEY;
  }
  if (Array.isArray(scope) && scope.length === 1) {
    return String(scope[0]);
  }
  if (Array.isArray(scope) && scope.length > 1) {
    return [...scope].sort((a, b) => a - b).join(',');
  }
  return ALL_PROJECTS_KEY;
}
