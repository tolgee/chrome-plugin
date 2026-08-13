import { describe, expect, it } from 'vitest';
import {
  compareValues,
  decodeTokenProjectSet,
  isOAuth,
  normalizeUrl,
  validateValues,
} from './tools';

// Builds a JWT-shaped string (header.payload.signature) whose payload base64url-encodes the given claims, so we can
// exercise the token parsing without a real signature.
const tokenWith = (claims: Record<string, unknown>) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
};

describe('decodeTokenProjectSet', () => {
  it('returns "*" for an all-projects token', () => {
    expect(decodeTokenProjectSet(tokenWith({ 'tg.prj': '*' }))).toBe('*');
  });

  it('returns the ids for a project-scoped token', () => {
    expect(decodeTokenProjectSet(tokenWith({ 'tg.prj': [2] }))).toEqual([2]);
    expect(decodeTokenProjectSet(tokenWith({ 'tg.prj': [2, 3] }))).toEqual([
      2, 3,
    ]);
  });

  it('coerces string ids to numbers and drops non-numeric entries', () => {
    expect(
      decodeTokenProjectSet(tokenWith({ 'tg.prj': ['2', 'x', 3] }))
    ).toEqual([2, 3]);
  });

  it('returns undefined when the claim is absent', () => {
    expect(decodeTokenProjectSet(tokenWith({ sub: '1' }))).toBeUndefined();
  });

  it('returns undefined for an empty or malformed token', () => {
    expect(decodeTokenProjectSet(undefined)).toBeUndefined();
    expect(decodeTokenProjectSet('not-a-jwt')).toBeUndefined();
  });
});

describe('validateValues', () => {
  it('accepts an api key with a url', () => {
    const v = { apiKey: 'tgpak_x', apiUrl: 'https://app.tolgee.io' };
    expect(validateValues(v)).toBe(v);
  });

  it('accepts an oauth token with a url', () => {
    const v = { authToken: 'jwt', apiUrl: 'https://app.tolgee.io' };
    expect(validateValues(v)).toBe(v);
  });

  it('rejects a credential without a url', () => {
    expect(validateValues({ apiKey: 'tgpak_x' })).toBeNull();
  });

  it('rejects a url without any credential', () => {
    expect(validateValues({ apiUrl: 'https://app.tolgee.io' })).toBeNull();
  });

  it('rejects null/undefined', () => {
    expect(validateValues(null)).toBeNull();
    expect(validateValues(undefined)).toBeNull();
  });
});

describe('isOAuth', () => {
  it('is true only for a bare auth token', () => {
    expect(isOAuth({ authToken: 'jwt' })).toBe(true);
  });

  it('is false when an api key is also present', () => {
    expect(isOAuth({ authToken: 'jwt', apiKey: 'tgpak_x' })).toBe(false);
  });

  it('is false for an api key alone or nothing', () => {
    expect(isOAuth({ apiKey: 'tgpak_x' })).toBe(false);
    expect(isOAuth(undefined)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('strips a single trailing slash', () => {
    expect(normalizeUrl('https://app.tolgee.io/')).toBe(
      'https://app.tolgee.io'
    );
  });

  it('leaves a url without a trailing slash untouched', () => {
    expect(normalizeUrl('https://app.tolgee.io')).toBe('https://app.tolgee.io');
  });

  it('passes through undefined', () => {
    expect(normalizeUrl(undefined)).toBeUndefined();
  });
});

describe('compareValues', () => {
  const base = {
    apiUrl: 'https://app.tolgee.io',
    apiKey: 'tgpak_x',
    branch: 'main',
    projectId: 2,
  };

  it('treats identical values as equal', () => {
    expect(compareValues(base, { ...base })).toBe(true);
  });

  it('treats an empty branch and undefined branch as equal', () => {
    expect(
      compareValues({ ...base, branch: '' }, { ...base, branch: undefined })
    ).toBe(true);
  });

  it('detects a differing field', () => {
    expect(compareValues(base, { ...base, projectId: 3 })).toBe(false);
    expect(compareValues(base, { ...base, authToken: 'jwt' })).toBe(false);
  });

  it('treats a string projectId and a numeric projectId as equal', () => {
    expect(
      compareValues({ ...base, projectId: '2' as any }, { ...base })
    ).toBe(true);
  });

  it('treats a null apiKey and an undefined apiKey as equal', () => {
    const oauth = { apiUrl: base.apiUrl, authToken: 'jwt', projectId: 1 };
    expect(
      compareValues({ ...oauth, apiKey: null as any }, { ...oauth })
    ).toBe(true);
  });
});
