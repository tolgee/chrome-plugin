import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './env';

// Chrome derives an extension's id from the manifest `key`: the first 32 hex chars of the SHA-256 of the decoded key,
// with each hex digit mapped to a-p.
export const extensionIdFromManifestKey = (key: string): string => {
  const hash = createHash('sha256')
    .update(Buffer.from(key, 'base64'))
    .digest('hex')
    .slice(0, 32);
  return [...hash]
    .map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16)))
    .join('');
};

export const manifestExtensionId = (): string => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8')
  );
  if (typeof manifest.key !== 'string') {
    throw new Error(
      'manifest.json has no "key", the extension id is not stable'
    );
  }
  return extensionIdFromManifestKey(manifest.key);
};
