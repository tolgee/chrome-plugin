import { describe, expect, it } from 'vitest';
import { shouldAcceptTokenPush } from './shouldAcceptTokenPush';

const base = {
  authToken: 'jwt',
  projectKey: '2',
  pageProjectId: '2',
  pageApiUrl: 'https://app.tolgee.io',
  pushApiUrl: 'https://app.tolgee.io',
};

describe('shouldAcceptTokenPush', () => {
  it('accepts a non-empty, same-project, same-backend push', () => {
    expect(shouldAcceptTokenPush(base)).toBe(true);
  });

  it('accepts an all-projects (*) push for any page project', () => {
    expect(
      shouldAcceptTokenPush({ ...base, projectKey: '*', pageProjectId: '9' })
    ).toBe(true);
  });

  it('rejects an empty token', () => {
    expect(shouldAcceptTokenPush({ ...base, authToken: '' })).toBe(false);
    expect(shouldAcceptTokenPush({ ...base, authToken: null })).toBe(false);
  });

  it('rejects a push whose concrete scope does not serve the page project', () => {
    expect(
      shouldAcceptTokenPush({ ...base, projectKey: '3', pageProjectId: '2' })
    ).toBe(false);
  });

  it('rejects a push from a different backend origin', () => {
    expect(
      shouldAcceptTokenPush({ ...base, pushApiUrl: 'https://evil.example' })
    ).toBe(false);
  });
});
