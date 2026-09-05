// Every fetch this extension makes to a user-configured Tolgee server host is hardened the same way: no ambient
// cookies travel (the credential is always a header, never a cookie), and a redirect is not followed - fetch
// forwards a custom header like X-API-Key (unlike Authorization) to whatever host the redirect names, and the
// caller's own allowlist only constrains the URL it built, not one a redirect could send it to. `redirect: 'manual'`
// rather than 'error' so a redirect surfaces as the distinguishable `isBlockedRedirect` response below instead of
// an indistinguishable network failure.
export const hardenedFetch = (
  url: string,
  init: RequestInit
): Promise<Response> =>
  fetch(url, { ...init, credentials: 'omit', redirect: 'manual' });

export const isBlockedRedirect = (res: Response): boolean =>
  res.type === 'opaqueredirect';
