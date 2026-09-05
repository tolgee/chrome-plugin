// A project API key (tgpak_...) carries its project id base32-encoded after the prefix; the platform builds it as
// `${projectId}_${secret}` (see ApiKeyService on the platform), which the SDK decodes the same way.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const projectIdOfApiKey = (
  apiKey: string | undefined
): number | undefined => {
  if (!apiKey) {
    return undefined;
  }
  const [prefix, encoded] = apiKey.split('_');
  if (prefix !== 'tgpak' || !encoded) {
    return undefined;
  }
  const decoded = base32Decode(encoded);
  if (decoded === undefined) {
    return undefined;
  }
  const [projectId] = decoded.split('_');
  return /^\d+$/.test(projectId) ? Number(projectId) : undefined;
};

const base32Decode = (input: string): string | undefined => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const char of input.toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      return undefined;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output += String.fromCharCode((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return output;
};
