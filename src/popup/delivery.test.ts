import { describe, expect, it } from 'vitest';
import { LibConfig } from '../types';
import {
  credentialDelivery,
  deliveryChanged,
  resolveAppliedValues,
  sdkTooOldFor,
} from './delivery';

const sdk = (protocolVersion?: number): LibConfig => ({
  uiPresent: true,
  protocolVersion,
  mode: 'production',
  config: { apiUrl: 'https://app.tolgee.io', apiKey: '', projectId: 7 },
});

describe('credentialDelivery', () => {
  it('keeps the key in the worker from protocol 2 on, hands it to the page before', () => {
    expect(credentialDelivery(sdk(2), true)).toBe('proxy');
    expect(credentialDelivery(sdk(3), true)).toBe('proxy');
    expect(credentialDelivery(sdk(1), true)).toBe('page');
    expect(credentialDelivery(sdk(undefined), true)).toBe('page');
  });

  it('is always proxy without an api key, whatever the SDK protocol', () => {
    expect(credentialDelivery(sdk(undefined), false)).toBe('proxy');
    expect(credentialDelivery(sdk(2), false)).toBe('proxy');
  });
});

describe('sdkTooOldFor', () => {
  const form = { apiUrl: 'https://app.tolgee.io' };
  const keyValues = { ...form, apiKey: 'tgpak_x', projectKey: '7' };
  const oauthValues = { ...form, oauth: true, projectKey: '7' };

  it('sign-in screen: an old SDK is too old to sign in (the API-key path is offered next to the alert)', () => {
    expect(
      sdkTooOldFor({
        libConfig: sdk(undefined),
        hasSession: false,
        siteKeyScreen: false,
        activeValues: form,
      })
    ).toBe(true);
    expect(
      sdkTooOldFor({
        libConfig: sdk(2),
        hasSession: false,
        siteKeyScreen: false,
        activeValues: form,
      })
    ).toBe(false);
  });

  it('sign-in screen: a key typed into the form does not drop the gate on signing in', () => {
    expect(
      sdkTooOldFor({
        libConfig: sdk(undefined),
        hasSession: false,
        siteKeyScreen: false,
        activeValues: keyValues,
      })
    ).toBe(true);
  });

  it('connected panel: an api key can be handed to an old SDK, a signed-in session cannot', () => {
    const old = sdk(undefined);
    expect(
      sdkTooOldFor({
        libConfig: old,
        hasSession: true,
        siteKeyScreen: false,
        activeValues: keyValues,
      })
    ).toBe(false);
    expect(
      sdkTooOldFor({
        libConfig: old,
        hasSession: true,
        siteKeyScreen: false,
        activeValues: oauthValues,
      })
    ).toBe(true);
  });

  it("site-key screen: the site's own key is used by the page, so no SDK is too old for it", () => {
    expect(
      sdkTooOldFor({
        libConfig: sdk(undefined),
        hasSession: false,
        siteKeyScreen: true,
        activeValues: form,
      })
    ).toBe(false);
  });
});

describe('deliveryChanged', () => {
  const applied = {
    apiUrl: 'https://app.tolgee.io',
    apiKey: 'tgpak_x',
    projectKey: '7',
  };

  it('a key the page holds needs re-delivering once its SDK can proxy', () => {
    expect(deliveryChanged({ apiKey: 'tgpak_x' }, applied, sdk(2))).toBe(true);
  });

  it('a proxied session needs re-delivering once its SDK can no longer proxy', () => {
    expect(
      deliveryChanged({ session: 'apiKey', projectKey: '7' }, applied, sdk(1))
    ).toBe(true);
  });

  it('leaves a page whose delivery still matches its SDK alone', () => {
    expect(deliveryChanged({ apiKey: 'tgpak_x' }, applied, sdk(1))).toBe(false);
    expect(
      deliveryChanged({ session: 'apiKey', projectKey: '7' }, applied, sdk(2))
    ).toBe(false);
    expect(
      deliveryChanged(
        { session: 'oauth', projectKey: '7' },
        { apiUrl: applied.apiUrl, oauth: true, projectKey: '7' },
        sdk(2)
      )
    ).toBe(false);
  });
});

describe('resolveAppliedValues', () => {
  // A pre-1.9.0 stored record has no projectKey (git show 5f6502d:src/popup/storage.ts). The worker refuses to
  // proxy such a record (oauth/connection.ts isApiKeyRecord), so restoring it here must not report a connected
  // session, and must not redeliver over the page's still-working legacy apiKey slot.
  it('a legacy stored record with no projectKey is not a connected session, and is never redelivered', () => {
    const legacyStored = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_legacy',
    };
    expect(
      resolveAppliedValues(
        { apiKey: 'tgpak_legacy', apiUrl: legacyStored.apiUrl },
        legacyStored,
        sdk(2)
      )
    ).toBeNull();
    expect(
      resolveAppliedValues(
        { session: 'apiKey', apiUrl: legacyStored.apiUrl },
        legacyStored,
        sdk(2)
      )
    ).toBeNull();
  });

  it('redelivers a pinned api-key session once its SDK can proxy', () => {
    const stored = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      projectId: 7,
      projectKey: '7',
    };
    const resolved = resolveAppliedValues(
      {
        apiKey: 'tgpak_x',
        apiUrl: stored.apiUrl,
        projectId: 7,
        projectKey: '7',
      },
      stored,
      sdk(2)
    );
    expect(resolved).not.toBeNull();
    expect(resolved?.redeliver).toBe(true);
    expect(resolved?.applied).toMatchObject({ apiKey: 'tgpak_x' });
  });

  it('does not redeliver when the delivery already matches the SDK', () => {
    const stored = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      projectId: 7,
      projectKey: '7',
    };
    const resolved = resolveAppliedValues(
      { session: 'apiKey', apiUrl: stored.apiUrl, projectKey: '7' },
      stored,
      sdk(2)
    );
    expect(resolved).not.toBeNull();
    expect(resolved?.redeliver).toBe(false);
  });
});
