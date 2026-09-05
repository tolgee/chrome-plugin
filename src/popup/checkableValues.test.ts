import { describe, expect, it } from 'vitest';
import { checkableValuesOf } from './checkableValues';

const OAUTH = { apiUrl: 'https://app.tolgee.io', oauth: true, projectKey: '7' };

describe('checkableValuesOf', () => {
  it('checks an applied session that agrees with the stored record', () => {
    expect(
      checkableValuesOf({
        libConfig: {
          uiPresent: true,
          mode: 'production',
          config: { apiUrl: '', apiKey: '' },
        },
        storedValues: OAUTH,
        appliedValues: OAUTH,
      })
    ).toEqual(OAUTH);
  });

  // appliedValues wins the pick, but only ever with values that compare equal to the stored record: the case
  // below (applied disagrees -> null) is the other half, so no input can show applied beating a *different* stored.
  it('prefers appliedValues over the page config when there is no stored record to agree with', () => {
    const applied = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_applied',
    };
    expect(
      checkableValuesOf({
        libConfig: {
          uiPresent: true,
          mode: 'production',
          config: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_page' },
        },
        storedValues: null,
        appliedValues: applied,
      })
    ).toEqual(applied);
  });

  it('falls back to storedValues, then to the page config, when nothing is applied', () => {
    expect(
      checkableValuesOf({
        libConfig: {
          uiPresent: true,
          mode: 'production',
          config: { apiUrl: '', apiKey: '' },
        },
        storedValues: OAUTH,
        appliedValues: null,
      })
    ).toEqual(OAUTH);

    const pageConfig = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' };
    expect(
      checkableValuesOf({
        libConfig: { uiPresent: true, mode: 'production', config: pageConfig },
        storedValues: null,
        appliedValues: null,
      })
    ).toEqual(pageConfig);
  });

  it('returns null when appliedValues disagrees with what is actually stored (the reducer has not reconciled yet)', () => {
    expect(
      checkableValuesOf({
        libConfig: {
          uiPresent: true,
          mode: 'production',
          config: { apiUrl: '', apiKey: '' },
        },
        storedValues: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_old' },
        appliedValues: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_new' },
      })
    ).toBeNull();
  });

  it('returns null for values that do not validate (no url or no credential)', () => {
    expect(
      checkableValuesOf({
        libConfig: {
          uiPresent: true,
          mode: 'production',
          config: { apiUrl: '', apiKey: '' },
        },
        storedValues: null,
        appliedValues: null,
      })
    ).toBeNull();
  });
});
