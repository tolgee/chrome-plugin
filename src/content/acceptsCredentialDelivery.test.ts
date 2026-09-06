import { describe, expect, it } from 'vitest';
import { acceptsCredentialDelivery } from './acceptsCredentialDelivery';

describe('acceptsCredentialDelivery', () => {
  it('with a supplied pageOrigin, accepts only a matching frame origin', () => {
    expect(
      acceptsCredentialDelivery({
        currentOrigin: 'https://a.io',
        isTopFrame: false,
        pageOrigin: 'https://a.io',
      })
    ).toBe(true);
    expect(
      acceptsCredentialDelivery({
        currentOrigin: 'https://evil.io',
        isTopFrame: true,
        pageOrigin: 'https://a.io',
      })
    ).toBe(false);
  });

  it('without a pageOrigin, falls back to the top frame only', () => {
    expect(
      acceptsCredentialDelivery({
        currentOrigin: 'https://a.io',
        isTopFrame: true,
      })
    ).toBe(true);
    expect(
      acceptsCredentialDelivery({
        currentOrigin: 'https://a.io',
        isTopFrame: false,
      })
    ).toBe(false);
  });
});
