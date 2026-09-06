// fetch forwards a custom header like X-API-Key (unlike Authorization) to whatever host a redirect names, and the
// caller's own allowlist only constrains the URL it built, not one a redirect could send it to.
export const hardenedFetch = (
  url: string,
  init: RequestInit
): Promise<Response> =>
  fetch(url, { ...init, credentials: 'omit', redirect: 'manual' });

export const isBlockedRedirect = (res: Response): boolean =>
  res.type === 'opaqueredirect';
