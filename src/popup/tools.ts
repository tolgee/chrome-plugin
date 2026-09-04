import { LibConfig } from '../types';
import { normalizeUrl } from '../oauth/url';

// See oauth/sessionRules.ts for the projectId-vs-projectKey distinction these two fields carry.
export type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  authToken?: string;
  projectId?: number;
  projectKey?: string;
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

export const canApplyOnEnter = (
  hasSession: boolean,
  tab: 'login' | 'apiKey',
  values: Values | null | undefined,
  canApplyApiKey: boolean
): boolean =>
  Boolean(
    hasSession ? validateValues(values) : tab === 'apiKey' && canApplyApiKey
  );

export const compareValues = (
  values1?: Values | null,
  values2?: Values | null
) => {
  // sessionStorage hands back projectId as a string and apiKey as null; the stored copy holds a number and undefined.
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

// The server field is free text; only an http(s) URL can be signed in to (or fetched from) at all.
export const isHttpUrl = (raw: string | undefined): boolean => {
  if (!raw) {
    return false;
  }
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// Same http(s) restriction as httpDisplayUrl below: the server URL is user-editable and ends up in an `<a href>`.
export const projectUrl = (
  apiUrl: string | undefined,
  projectId: number | undefined
): string | null => {
  if (!apiUrl || projectId === undefined) {
    return null;
  }
  try {
    const { protocol } = new URL(apiUrl);
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  return `${normalizeUrl(apiUrl)}/projects/${projectId}`;
};

// A display host and a link target for a user-editable server URL. Restricted to http(s): the raw value could be
// `javascript:...`, which a plain `<a href>` would execute with extension privileges, so anything else falls back.
export const httpDisplayUrl = (
  raw: string,
  fallback: string
): { host: string; link: string } => {
  try {
    const parsed = new URL(raw);
    const link =
      parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? parsed.toString()
        : fallback;
    return { host: parsed.host, link };
  } catch {
    return { host: raw, link: fallback };
  }
};
