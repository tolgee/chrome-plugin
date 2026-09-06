import { describe, expect, it } from 'vitest';
import {
  confirmsKeyUnusable,
  confirmsProjectInaccessible,
  confirmsTokenUnusable,
  errorCodeOf,
  projectKeyFor,
} from './sessionRules';

describe('projectKeyFor', () => {
  it('keys a concrete project by its id', () => {
    expect(projectKeyFor(5)).toBe('5');
    expect(projectKeyFor('5')).toBe('5');
  });
});

describe('confirmsProjectInaccessible', () => {
  it('treats 403 and 404 as a definitive answer', () => {
    expect(confirmsProjectInaccessible(403)).toBe(true);
    expect(confirmsProjectInaccessible(404)).toBe(true);
  });

  it('treats a server error, an unrelated status, or 401 as inconclusive, not a confirmed answer', () => {
    expect(confirmsProjectInaccessible(500)).toBe(false);
    expect(confirmsProjectInaccessible(502)).toBe(false);
    expect(confirmsProjectInaccessible(429)).toBe(false);
    expect(confirmsProjectInaccessible(401)).toBe(false);
  });

  it("treats the platform's 400 project_not_selected (a project id that does not exist) as definitive, other 400s not", () => {
    expect(confirmsProjectInaccessible(400, 'project_not_selected')).toBe(true);
    expect(confirmsProjectInaccessible(400, 'feature_not_enabled')).toBe(false);
    expect(confirmsProjectInaccessible(400)).toBe(false);
    expect(confirmsProjectInaccessible(400, null)).toBe(false);
    expect(confirmsProjectInaccessible(500, 'project_not_selected')).toBe(
      false
    );
  });
});

describe('errorCodeOf', () => {
  it('reads the code from an error body', async () => {
    expect(
      await errorCodeOf({
        json: async () => ({ code: 'project_not_selected', params: null }),
      })
    ).toBe('project_not_selected');
  });

  it('answers undefined for a body without a string code, an empty body, or one that is not JSON', async () => {
    expect(await errorCodeOf({ json: async () => ({ code: 7 }) })).toBe(
      undefined
    );
    expect(await errorCodeOf({ json: async () => null })).toBe(undefined);
    expect(
      await errorCodeOf({
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      })
    ).toBe(undefined);
  });
});

describe('confirmsTokenUnusable', () => {
  it('treats 401 as a definitive answer', () => {
    expect(confirmsTokenUnusable(401)).toBe(true);
  });

  it('treats 403/404 (a project-scope problem, not a dead token) and server errors as inconclusive', () => {
    expect(confirmsTokenUnusable(403)).toBe(false);
    expect(confirmsTokenUnusable(404)).toBe(false);
    expect(confirmsTokenUnusable(500)).toBe(false);
  });
});

describe('confirmsKeyUnusable', () => {
  it('treats the answers the platform gives an unusable key as definitive', () => {
    expect(confirmsKeyUnusable(400)).toBe(true);
    expect(confirmsKeyUnusable(401)).toBe(true);
    expect(confirmsKeyUnusable(403)).toBe(true);
  });

  it('says nothing about the key on anything else', () => {
    expect(confirmsKeyUnusable(404)).toBe(false);
    expect(confirmsKeyUnusable(500)).toBe(false);
    expect(confirmsKeyUnusable(200)).toBe(false);
  });
});
