import { describe, expect, it } from 'vitest';
import {
  connectRefusalOf,
  isProjectInaccessibleRefusal,
  ProjectInaccessibleError,
} from './connectRefusal';

describe('connectRefusal', () => {
  it('turns the worker-side error into the machine-readable refusal the popup keys on', () => {
    const error = new ProjectInaccessibleError(28, 'https://app.tolgee.io');

    expect(error.message).toBe(
      "This account can't access project #28 on app.tolgee.io"
    );
    expect(connectRefusalOf(error)).toEqual({
      code: 'project_inaccessible',
      projectId: 28,
      apiUrl: 'https://app.tolgee.io',
    });
  });

  it('is not produced for any other error', () => {
    expect(connectRefusalOf(new Error('boom'))).toBeUndefined();
    expect(connectRefusalOf('boom')).toBeUndefined();
  });

  it('recognises the refusal in a login response and nothing else', () => {
    expect(
      isProjectInaccessibleRefusal({
        code: 'project_inaccessible',
        projectId: 28,
        apiUrl: 'https://app.tolgee.io',
        error: 'text',
      })
    ).toBe(true);
    expect(isProjectInaccessibleRefusal({ error: 'access_denied' })).toBe(
      false
    );
    expect(isProjectInaccessibleRefusal({ code: 'project_inaccessible' })).toBe(
      false
    );
    expect(
      isProjectInaccessibleRefusal({
        code: 'project_inaccessible',
        projectId: 28,
      })
    ).toBe(false);
    expect(isProjectInaccessibleRefusal(undefined)).toBe(false);
    expect(isProjectInaccessibleRefusal(null)).toBe(false);
  });
});
