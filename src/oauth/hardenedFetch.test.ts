import { afterEach, describe, expect, it, vi } from 'vitest';
import { hardenedFetch, isBlockedRedirect } from './hardenedFetch';

afterEach(() => vi.unstubAllGlobals());

describe('hardenedFetch', () => {
  it('always omits ambient credentials and refuses to follow a redirect', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await hardenedFetch('https://api.example/x', { method: 'GET' });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example/x', {
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
    });
  });

  it('cannot be weakened by a caller trying to pass its own credentials/redirect', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await hardenedFetch('https://api.example/x', {
      credentials: 'include',
      redirect: 'follow',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('manual');
  });
});

describe('isBlockedRedirect', () => {
  it('recognises an opaque redirect response', () => {
    expect(isBlockedRedirect({ type: 'opaqueredirect' } as Response)).toBe(
      true
    );
  });

  it('is false for a normal response', () => {
    expect(isBlockedRedirect({ type: 'basic' } as Response)).toBe(false);
    expect(isBlockedRedirect({ type: 'cors' } as Response)).toBe(false);
  });
});
