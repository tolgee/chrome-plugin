export function normalizeUrl(url: string): string;
export function normalizeUrl(url: string | undefined): string | undefined;
export function normalizeUrl(url: string | undefined) {
  return url?.replace(/\/$/, '');
}

export const originOf = (url: string): string => new URL(url).origin;

export const safeOrigin = (url?: string | null): string | undefined =>
  url ? safeUrl(url)?.origin : undefined;

export const sameOrigin = (a?: string | null, b?: string | null): boolean => {
  const oa = safeOrigin(a);
  return oa !== undefined && oa === safeOrigin(b);
};

// Unparseable input is shown as it was typed: it is a server URL the user is still editing.
export const hostOf = (raw: string): string => safeUrl(raw)?.host ?? raw;

export const isHttpUrl = (raw: string | undefined): raw is string => {
  const parsed = raw ? safeUrl(raw) : undefined;
  return parsed !== undefined && isHttpProtocol(parsed.protocol);
};

export const projectUrl = (
  apiUrl: string | undefined,
  projectId: number | undefined
): string | null =>
  isHttpUrl(apiUrl) && projectId !== undefined
    ? `${normalizeUrl(apiUrl)}/projects/${projectId}`
    : null;

// A display host and a link target for a user-editable server URL. Restricted to http(s): the raw value could be
// `javascript:...`, which a plain `<a href>` would execute with extension privileges, so anything else falls back.
export const httpDisplayUrl = (
  raw: string,
  fallback: string
): { host: string; link: string } => {
  const parsed = safeUrl(raw);
  return {
    host: hostOf(raw),
    link:
      parsed && isHttpProtocol(parsed.protocol) ? parsed.toString() : fallback,
  };
};

const isHttpProtocol = (protocol: string) =>
  protocol === 'http:' || protocol === 'https:';

const safeUrl = (raw: string): URL | undefined => {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
};
