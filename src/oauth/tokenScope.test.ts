import { describe, expect, it } from 'vitest';
import {
  ALL_PROJECTS_KEY,
  projectKeyForToken,
  scopeServesProject,
} from './tokenScope';

// JWT-shaped string whose payload base64url-encodes the given claims.
const tokenWith = (claims: Record<string, unknown>) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
};

describe('projectKeyForToken', () => {
  it('keys an all-projects token as *', () => {
    expect(projectKeyForToken(tokenWith({ 'tg.prj': '*' }))).toBe('*');
  });

  it('keys a single-project token by its id', () => {
    expect(projectKeyForToken(tokenWith({ 'tg.prj': [2] }))).toBe('2');
  });

  it('keys a numeric (non-array) single-project claim by its id', () => {
    expect(projectKeyForToken(tokenWith({ 'tg.prj': 5 }))).toBe('5');
  });

  it('keys a scalar-string single-project claim by its id', () => {
    expect(projectKeyForToken(tokenWith({ 'tg.prj': '5' }))).toBe('5');
  });

  it('keys a multi-project set by its sorted ids (not folded into *)', () => {
    expect(projectKeyForToken(tokenWith({ 'tg.prj': [3, 2] }))).toBe('2,3');
  });

  it('keys an undecodable / claimless token as *', () => {
    expect(projectKeyForToken(tokenWith({ sub: '1' }))).toBe(ALL_PROJECTS_KEY);
    expect(projectKeyForToken('not-a-jwt')).toBe(ALL_PROJECTS_KEY);
  });

  it('keys an empty or all-non-numeric project claim as * (no concrete set to key by)', () => {
    expect(projectKeyForToken(tokenWith({ 'tg.prj': [] }))).toBe(
      ALL_PROJECTS_KEY
    );
    expect(projectKeyForToken(tokenWith({ 'tg.prj': ['x', 'y'] }))).toBe(
      ALL_PROJECTS_KEY
    );
  });
});

describe('scopeServesProject', () => {
  it('an all-projects key serves any page', () => {
    expect(scopeServesProject('*', '7')).toBe(true);
    expect(scopeServesProject('*', null)).toBe(true);
  });

  it('a concrete key serves only its own project', () => {
    expect(scopeServesProject('3', '3')).toBe(true);
    expect(scopeServesProject('3', '2')).toBe(false);
    expect(scopeServesProject('3', null)).toBe(false);
  });

  it('a multi-project key serves only its member projects', () => {
    expect(scopeServesProject('5,7', '5')).toBe(true);
    expect(scopeServesProject('5,7', '7')).toBe(true);
    expect(scopeServesProject('5,7', '9')).toBe(false);
  });

  it('an absent key (older background push) serves any page', () => {
    expect(scopeServesProject(undefined, '3')).toBe(true);
  });
});
