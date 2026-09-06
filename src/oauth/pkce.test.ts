import { describe, expect, it } from 'vitest';
import { challengeFromVerifier, randomUrlSafe } from './pkce';

describe('pkce', () => {
  it('derives the S256 challenge from the RFC 7636 Appendix B vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await challengeFromVerifier(verifier)).toBe(challenge);
  });

  it('emits base64url with no +, / or = padding', () => {
    const value = randomUrlSafe();
    expect(value).not.toMatch(/[+/=]/);
    expect(value.length).toBeGreaterThan(0);
  });

  it('produces a different verifier each call', () => {
    expect(randomUrlSafe()).not.toBe(randomUrlSafe());
  });
});
