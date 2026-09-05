import { describe, expect, it } from 'vitest';
import {
  hostOf,
  httpDisplayUrl,
  isHttpUrl,
  normalizeUrl,
  originOf,
  projectUrl,
  safeOrigin,
  sameOrigin,
} from './url';

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

describe('isHttpUrl', () => {
  it('accepts http and https servers', () => {
    expect(isHttpUrl('https://app.tolgee.io')).toBe(true);
    expect(isHttpUrl('http://localhost:8080/')).toBe(true);
  });

  it('rejects an empty, malformed or non-http value', () => {
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('app.tolgee.io')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('projectUrl', () => {
  it('links to the project on the server, with or without a trailing slash', () => {
    expect(projectUrl('https://app.tolgee.io', 7)).toBe(
      'https://app.tolgee.io/projects/7'
    );
    expect(projectUrl('https://app.tolgee.io/', 7)).toBe(
      'https://app.tolgee.io/projects/7'
    );
  });

  it('is null without a server or a project id', () => {
    expect(projectUrl(undefined, 7)).toBeNull();
    expect(projectUrl('', 7)).toBeNull();
    expect(projectUrl('https://app.tolgee.io', undefined)).toBeNull();
  });

  it('refuses a non-http(s) or malformed server url', () => {
    expect(projectUrl('javascript:alert(1)', 7)).toBeNull();
    expect(projectUrl('not a url', 7)).toBeNull();
  });
});

describe('hostOf', () => {
  it('names the host, port included, and hands back what it cannot parse', () => {
    expect(hostOf('https://app.tolgee.io/v2/user')).toBe('app.tolgee.io');
    expect(hostOf('http://localhost:8080')).toBe('localhost:8080');
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('httpDisplayUrl', () => {
  const FALLBACK = 'https://app.tolgee.io';

  it('shows the host and links to an http(s) url as-is', () => {
    expect(httpDisplayUrl('https://my.tolgee.example/x', FALLBACK)).toEqual({
      host: 'my.tolgee.example',
      link: 'https://my.tolgee.example/x',
    });
  });

  it('falls back the link (never executing it) for a non-http(s) scheme', () => {
    expect(
      httpDisplayUrl('javascript:alert(document.cookie)', FALLBACK)
    ).toEqual({
      host: '',
      link: FALLBACK,
    });
  });

  it('falls back both host and link for an unparseable value', () => {
    expect(httpDisplayUrl('not a url', FALLBACK)).toEqual({
      host: 'not a url',
      link: FALLBACK,
    });
  });
});
