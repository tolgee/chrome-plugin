import { describe, expect, it } from 'vitest';
import { projectIdOfApiKey } from './apiKeyProject';

// The same keys tolgee-js decodes in packages/web/src/package/tools/decodeApiKey.test.ts.
const PAK_FOR_PROJECT_1 = 'tgpak_gfpxm4lin4zdazleoq4gm2rumfxgi2lfom2gw4dpguzxc';

describe('projectIdOfApiKey', () => {
  it('decodes the project a tgpak belongs to', () => {
    expect(projectIdOfApiKey(PAK_FOR_PROJECT_1)).toBe(1);
  });

  it('knows no project for a PAT, a legacy key or nothing at all', () => {
    expect(projectIdOfApiKey('tgpat_abc')).toBeUndefined();
    expect(projectIdOfApiKey('legacykey')).toBeUndefined();
    expect(projectIdOfApiKey('')).toBeUndefined();
    expect(projectIdOfApiKey(undefined)).toBeUndefined();
  });

  it('knows no project for a tgpak whose payload does not decode to an id', () => {
    expect(projectIdOfApiKey('tgpak_mfrggzdf')).toBeUndefined();
    expect(projectIdOfApiKey('tgpak_!!!')).toBeUndefined();
    expect(projectIdOfApiKey('tgpak_')).toBeUndefined();
  });
});
