import { describe, expect, it } from 'vitest';
import {
  confirmsProjectInaccessible,
  confirmsTokenUnusable,
  projectKeyFor,
  servesSameProject,
} from './sessionRules';

describe('projectKeyFor', () => {
  it('keys a concrete project by its id', () => {
    expect(projectKeyFor(5)).toBe('5');
    expect(projectKeyFor('5')).toBe('5');
  });
});

describe('servesSameProject', () => {
  it('serves only its own project', () => {
    expect(servesSameProject('3', '3')).toBe(true);
    expect(servesSameProject('3', '2')).toBe(false);
    expect(servesSameProject('3', null)).toBe(false);
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
