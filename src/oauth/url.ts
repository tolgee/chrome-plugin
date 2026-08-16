export function normalizeUrl(url: string): string;
export function normalizeUrl(url: string | undefined): string | undefined;
export function normalizeUrl(url: string | undefined) {
  return url?.replace(/\/$/, '');
}

export const originOf = (url: string): string => new URL(url).origin;

export const safeOrigin = (url?: string | null): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

export const sameOrigin = (a?: string | null, b?: string | null): boolean => {
  const oa = safeOrigin(a);
  return oa !== undefined && oa === safeOrigin(b);
};
