import { describe, expect, it } from 'vitest';
import { shouldAcceptTokenPush } from './shouldAcceptTokenPush';

const base = {
  authToken: 'jwt',
  projectKey: '2',
  pageProjectKey: '2',
  pageApiUrl: 'https://app.tolgee.io',
  pushApiUrl: 'https://app.tolgee.io',
};

describe('shouldAcceptTokenPush', () => {
  it('accepts a non-empty, same-project, same-backend push', () => {
    expect(shouldAcceptTokenPush(base)).toBe(true);
  });

  it('rejects an empty token', () => {
    expect(shouldAcceptTokenPush({ ...base, authToken: '' })).toBe(false);
    expect(shouldAcceptTokenPush({ ...base, authToken: null })).toBe(false);
  });

  it('rejects a push with no projectKey', () => {
    expect(shouldAcceptTokenPush({ ...base, projectKey: undefined })).toBe(
      false
    );
  });

  it('rejects a push whose concrete scope does not serve the page project', () => {
    expect(
      shouldAcceptTokenPush({ ...base, projectKey: '3', pageProjectKey: '2' })
    ).toBe(false);
  });

  it('rejects a push from a different backend origin', () => {
    expect(
      shouldAcceptTokenPush({ ...base, pushApiUrl: 'https://evil.example' })
    ).toBe(false);
  });
});
