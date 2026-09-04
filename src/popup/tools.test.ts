import { describe, expect, it } from 'vitest';
import {
  canApplyOnEnter,
  compareValues,
  declaredProjectId,
  httpDisplayUrl,
  isOAuth,
  projectUrl,
  validateValues,
} from './tools';
import { LibConfig } from '../types';

const withProjectId = (projectId: unknown): LibConfig => ({
  uiPresent: true,
  mode: 'production',
  config: { apiUrl: '', apiKey: '', projectId: projectId as number | string },
});

describe('declaredProjectId', () => {
  it('returns the numeric project id and coerces a string id', () => {
    expect(declaredProjectId(withProjectId(7))).toBe(7);
    expect(declaredProjectId(withProjectId('7'))).toBe(7);
  });

  it('is undefined for blank, absent, or non-numeric', () => {
    expect(declaredProjectId(withProjectId(''))).toBeUndefined();
    expect(declaredProjectId(withProjectId(undefined))).toBeUndefined();
    expect(declaredProjectId(undefined)).toBeUndefined();
    expect(declaredProjectId(withProjectId('abc'))).toBeUndefined();
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
    expect(compareValues({ ...base, projectId: '2' as any }, { ...base })).toBe(
      true
    );
  });

  it('treats a null apiKey and an undefined apiKey as equal', () => {
    const oauth = { apiUrl: base.apiUrl, authToken: 'jwt', projectId: 1 };
    expect(compareValues({ ...oauth, apiKey: null as any }, { ...oauth })).toBe(
      true
    );
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

describe('canApplyOnEnter', () => {
  const oauthValues = { apiUrl: 'https://app.tolgee.io', authToken: 'jwt' };

  it('connected panel (hasSession): applies whenever the current values validate, regardless of tab', () => {
    expect(canApplyOnEnter(true, 'login', oauthValues, false)).toBe(true);
    expect(canApplyOnEnter(true, 'apiKey', oauthValues, false)).toBe(true);
  });

  it('connected panel (hasSession): does not apply when values do not validate', () => {
    expect(canApplyOnEnter(true, 'login', { apiUrl: 'x' }, false)).toBe(false);
  });

  it('API-key tab (not connected): applies only when canApplyApiKey is true, ignoring values', () => {
    expect(canApplyOnEnter(false, 'apiKey', oauthValues, true)).toBe(true);
    expect(canApplyOnEnter(false, 'apiKey', oauthValues, false)).toBe(false);
  });

  it('Login tab (not connected): never applies, even with a stale/foreign apiKey sitting in values', () => {
    const staleApiKeyValues = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
    };
    expect(canApplyOnEnter(false, 'login', staleApiKeyValues, true)).toBe(
      false
    );
    expect(canApplyOnEnter(false, 'login', staleApiKeyValues, false)).toBe(
      false
    );
  });
});
