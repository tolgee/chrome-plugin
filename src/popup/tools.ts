import { LibConfig } from '../types';

export type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  authToken?: string;
  projectId?: number;
};

export const declaredProjectId = (
  libConfig?: LibConfig | null
): number | undefined => {
  const raw = libConfig?.config?.projectId;
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
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
  // A restored session and the page's applied values describe the same credentials but not identically: sessionStorage
  // hands back projectId as a string and apiKey as null, while the stored copy holds a number and undefined. Normalize
  // so a healthy OAuth session isn't seen as "changed" (which would skip the connected-user lookup).
  const str = (v?: string | null) => v || undefined;
  const num = (v?: number | string | null) =>
    v === undefined || v === null || v === '' ? undefined : Number(v);
  return (
    str(values1?.apiKey) === str(values2?.apiKey) &&
    str(values1?.apiUrl) === str(values2?.apiUrl) &&
    str(values1?.authToken) === str(values2?.authToken) &&
    num(values1?.projectId) === num(values2?.projectId) &&
    (values1?.branch || '') === (values2?.branch || '')
  );
};

export { normalizeUrl } from '../oauth/url';
export { decodeTokenProjectSet } from '../oauth/tokenScope';
