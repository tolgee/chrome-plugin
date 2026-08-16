// PKCE (RFC 7636).

export const randomUrlSafe = (byteLength = 32): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

export const challengeFromVerifier = async (
  verifier: string
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64UrlEncode(new Uint8Array(digest));
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
