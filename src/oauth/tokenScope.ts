export const ALL_PROJECTS_KEY = '*';

export const projectKeyForToken = (token: string): string => {
  const scope = decodeTokenProjectSet(token);
  if (Array.isArray(scope) && scope.length >= 1) {
    return [...scope].sort((a, b) => a - b).join(',');
  }
  return ALL_PROJECTS_KEY;
};

export const scopeServesProject = (
  projectKey: string | undefined,
  pageProjectId: string | null
): boolean => {
  if (projectKey === undefined || projectKey === ALL_PROJECTS_KEY) {
    return true;
  }
  return (
    pageProjectId !== null && projectKey.split(',').includes(pageProjectId)
  );
};

export const decodeTokenProjectSet = (
  token: string | undefined
): '*' | number[] | undefined => {
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
    if (typeof prj === 'number' || typeof prj === 'string') {
      const n = Number(prj);
      return Number.isNaN(n) ? undefined : [n];
    }
    if (Array.isArray(prj)) {
      return prj.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    }
    return undefined;
  } catch {
    return undefined;
  }
};
