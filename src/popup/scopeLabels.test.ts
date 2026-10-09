import { describe, expect, it } from 'vitest';
import {
  OAUTH_SCOPES,
  OPTIONAL_OAUTH_SCOPES,
  REQUIRED_OAUTH_SCOPES,
} from '../constants';
import { scopeLabel } from './scopeLabels';

describe('the scopes the extension asks for', () => {
  it('names each one once: a scope promoted to required and left optional would be sent twice', () => {
    expect(new Set(OAUTH_SCOPES).size).toBe(
      REQUIRED_OAUTH_SCOPES.length + OPTIONAL_OAUTH_SCOPES.length
    );
  });
});

describe('scopeLabel', () => {
  it('has words for every scope the extension asks for', () => {
    for (const scope of OAUTH_SCOPES) {
      expect(scopeLabel(scope), scope).not.toBe(scope);
    }
  });

  it('shows a scope it has no words for as it is', () => {
    expect(scopeLabel('batch-jobs.view')).toBe('batch-jobs.view');
  });
});
