import { describe, expect, it } from 'vitest';
import { normalizeUrl, originOf, safeOrigin, sameOrigin } from './url';

describe('normalizeUrl', () => {
  it('trims a single trailing slash and passes undefined through', () => {
    expect(normalizeUrl('https://app.tolgee.io/')).toBe(
      'https://app.tolgee.io'
    );
    expect(normalizeUrl('https://app.tolgee.io')).toBe('https://app.tolgee.io');
    expect(normalizeUrl(undefined)).toBeUndefined();
  });
});

describe('originOf', () => {
  it('returns the origin of a valid url', () => {
    expect(originOf('https://app.tolgee.io/foo?x=1')).toBe(
      'https://app.tolgee.io'
    );
  });

  it('throws on a malformed url', () => {
    expect(() => originOf('not a url')).toThrow();
  });
});

describe('safeOrigin', () => {
  it('returns the origin of a valid url', () => {
    expect(safeOrigin('https://app.tolgee.io/x')).toBe('https://app.tolgee.io');
  });

  it('returns undefined for undefined, null, or a malformed url', () => {
    expect(safeOrigin(undefined)).toBeUndefined();
    expect(safeOrigin(null)).toBeUndefined();
    expect(safeOrigin('')).toBeUndefined();
    expect(safeOrigin('not a url')).toBeUndefined();
  });
});

describe('sameOrigin', () => {
  it('is true only for two parseable, equal origins', () => {
    expect(sameOrigin('https://a.io/x', 'https://a.io/y')).toBe(true);
    expect(sameOrigin('https://a.io', 'https://b.io')).toBe(false);
  });

  it('is false when either side is unparseable or absent (including both undefined)', () => {
    expect(sameOrigin('https://a.io', 'nope')).toBe(false);
    expect(sameOrigin(undefined, 'https://a.io')).toBe(false);
    expect(sameOrigin(undefined, undefined)).toBe(false);
  });
});
