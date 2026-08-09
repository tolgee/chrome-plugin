export type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  // OAuth access token (from "Connect with Tolgee"); an alternative to apiKey
  authToken?: string;
  // Project selected in the OAuth path; PAKs embed the project id, OAuth tokens don't, so the user picks one.
  projectId?: number;
};

export const validateValues = (values?: Values | null) => {
  if ((values?.apiKey || values?.authToken) && values?.apiUrl) {
    return values;
  }
  return null;
};

export const isOAuth = (values?: Values | null) =>
  Boolean(values?.authToken && !values?.apiKey);

export const compareValues = (
  values1?: Values | null,
  values2?: Values | null
) => {
  return (
    values1?.apiKey === values2?.apiKey &&
    values1?.apiUrl === values2?.apiUrl &&
    values1?.authToken === values2?.authToken &&
    values1?.projectId === values2?.projectId &&
    (values1?.branch || '') === (values2?.branch || '')
  );
};

export function normalizeUrl(url: string | undefined) {
  return url?.replace(/\/$/, '');
}

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
