import { describe, expect, it } from 'vitest';
import {
  activeValuesOf,
  appliedValuesFrom,
  hasSessionOf,
  siteKeyOf,
  canApplyOnEnter,
  compareValues,
  declaredProjectId,
  isConnectedSession,
  isOAuth,
  migrateLegacyApiKeyRecord,
  pageCredentials,
  pageEditing,
  sdkSupportsProxy,
  validateValues,
} from './tools';
import { LibConfig } from '../types';

const withProjectId = (projectId: unknown): LibConfig => ({
  uiPresent: true,
  mode: 'production',
  config: { apiUrl: '', apiKey: '', projectId: projectId as number | string },
});

const sdk = (protocolVersion?: number): LibConfig => ({
  uiPresent: true,
  protocolVersion,
  mode: 'production',
  config: { apiUrl: '', apiKey: '' },
});

describe('declaredProjectId', () => {
  it('returns the numeric project id and coerces a string id', () => {
    expect(declaredProjectId(withProjectId(7))).toBe(7);
    expect(declaredProjectId(withProjectId('7'))).toBe(7);
  });

  it('is undefined for blank, absent, or non-numeric', () => {
    expect(declaredProjectId(withProjectId(''))).toBeUndefined();
    expect(declaredProjectId(withProjectId(undefined))).toBeUndefined();
    expect(declaredProjectId(undefined)).toBeUndefined();
    expect(declaredProjectId(withProjectId('abc'))).toBeUndefined();
  });
});

describe('validateValues', () => {
  it('accepts an api key with a url', () => {
    const v = { apiKey: 'tgpak_x', apiUrl: 'https://app.tolgee.io' };
    expect(validateValues(v)).toBe(v);
  });

  it('accepts a signed-in session with a url', () => {
    const v = { oauth: true, apiUrl: 'https://app.tolgee.io' };
    expect(validateValues(v)).toBe(v);
  });

  it('rejects a credential without a url', () => {
    expect(validateValues({ apiKey: 'tgpak_x' })).toBeNull();
  });

  it('rejects a url without any credential', () => {
    expect(validateValues({ apiUrl: 'https://app.tolgee.io' })).toBeNull();
  });

  it('rejects null/undefined', () => {
    expect(validateValues(null)).toBeNull();
    expect(validateValues(undefined)).toBeNull();
  });
});

describe('isConnectedSession', () => {
  it('accepts an api key pinned to a project', () => {
    expect(
      isConnectedSession({
        apiKey: 'tgpak_x',
        apiUrl: 'https://app.tolgee.io',
        projectKey: '7',
      })
    ).toBe(true);
  });

  it('rejects a pre-cut-over api-key record with no projectKey', () => {
    expect(
      isConnectedSession({
        apiKey: 'tgpak_x',
        apiUrl: 'https://app.tolgee.io',
      })
    ).toBe(false);
  });

  it('accepts a signed-in session without requiring a projectKey', () => {
    expect(
      isConnectedSession({ oauth: true, apiUrl: 'https://app.tolgee.io' })
    ).toBe(true);
  });

  it('rejects null/undefined', () => {
    expect(isConnectedSession(null)).toBe(false);
    expect(isConnectedSession(undefined)).toBe(false);
  });
});

describe('migrateLegacyApiKeyRecord', () => {
  const PAK_FOR_PROJECT_1 =
    'tgpak_gfpxm4lin4zdazleoq4gm2rumfxgi2lfom2gw4dpguzxc';

  it('pins a pre-1.9.0 record by decoding the project id straight out of the key', () => {
    const migrated = migrateLegacyApiKeyRecord({
      apiUrl: 'https://app.tolgee.io',
      apiKey: PAK_FOR_PROJECT_1,
      branch: 'main',
    });
    expect(migrated).toEqual({
      apiUrl: 'https://app.tolgee.io',
      apiKey: PAK_FOR_PROJECT_1,
      branch: 'main',
      projectId: 1,
      projectKey: '1',
    });
  });

  it('gives up on a key it cannot decode a project id out of', () => {
    expect(
      migrateLegacyApiKeyRecord({
        apiUrl: 'https://app.tolgee.io',
        apiKey: 'tgpak_legacy',
      })
    ).toBeNull();
  });

  it('is a no-op for a record that already has a projectKey', () => {
    const already = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: PAK_FOR_PROJECT_1,
      projectKey: '1',
    };
    expect(migrateLegacyApiKeyRecord(already)).toBeNull();
  });

  it('does not migrate an OAuth record or one with no key at all', () => {
    expect(
      migrateLegacyApiKeyRecord({
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
      })
    ).toBeNull();
    expect(
      migrateLegacyApiKeyRecord({ apiUrl: 'https://app.tolgee.io' })
    ).toBeNull();
  });
});

describe('isOAuth', () => {
  it('is true only for a bare signed-in flag', () => {
    expect(isOAuth({ oauth: true })).toBe(true);
  });

  it('is false when an api key is also present', () => {
    expect(isOAuth({ oauth: true, apiKey: 'tgpak_x' })).toBe(false);
  });

  it('is false for an api key alone or nothing', () => {
    expect(isOAuth({ apiKey: 'tgpak_x' })).toBe(false);
    expect(isOAuth(undefined)).toBe(false);
  });
});

describe('compareValues', () => {
  const base = {
    apiUrl: 'https://app.tolgee.io',
    apiKey: 'tgpak_x',
    branch: 'main',
    projectId: 2,
  };

  it('treats identical values as equal', () => {
    expect(compareValues(base, { ...base })).toBe(true);
  });

  it('treats an empty branch and undefined branch as equal', () => {
    expect(
      compareValues({ ...base, branch: '' }, { ...base, branch: undefined })
    ).toBe(true);
  });

  it('detects a differing field', () => {
    expect(compareValues(base, { ...base, projectId: 3 })).toBe(false);
    expect(compareValues(base, { ...base, oauth: true })).toBe(false);
  });

  it('treats a string projectId and a numeric projectId as equal', () => {
    expect(compareValues({ ...base, projectId: '2' as any }, { ...base })).toBe(
      true
    );
  });

  it('treats a null apiKey and an undefined apiKey as equal', () => {
    const oauth = { apiUrl: base.apiUrl, oauth: true, projectId: 1 };
    expect(compareValues({ ...oauth, apiKey: null as any }, { ...oauth })).toBe(
      true
    );
  });

  it('treats a missing signed-in flag and false as equal', () => {
    expect(compareValues({ ...base, oauth: false }, { ...base })).toBe(true);
  });
});

describe('sdkSupportsProxy', () => {
  it('is true from protocol 2 on', () => {
    expect(sdkSupportsProxy(withProjectId(1))).toBe(false);
    expect(sdkSupportsProxy({ ...withProjectId(1), protocolVersion: 1 })).toBe(
      false
    );
    expect(sdkSupportsProxy({ ...withProjectId(1), protocolVersion: 2 })).toBe(
      true
    );
    expect(sdkSupportsProxy({ ...withProjectId(1), protocolVersion: 3 })).toBe(
      true
    );
  });

  it('is false without a config at all', () => {
    expect(sdkSupportsProxy(null)).toBe(false);
    expect(sdkSupportsProxy(undefined)).toBe(false);
  });
});

describe('canApplyOnEnter', () => {
  const oauthValues = { apiUrl: 'https://app.tolgee.io', oauth: true };

  it('connected panel (hasSession): applies whenever the current values validate, regardless of tab', () => {
    expect(canApplyOnEnter(true, 'login', oauthValues, false)).toBe(true);
    expect(canApplyOnEnter(true, 'apiKey', oauthValues, false)).toBe(true);
  });

  it('connected panel (hasSession): does not apply when values do not validate', () => {
    expect(canApplyOnEnter(true, 'login', { apiUrl: 'x' }, false)).toBe(false);
  });

  it('API-key tab (not connected): applies only when canApplyApiKey is true, ignoring values', () => {
    expect(canApplyOnEnter(false, 'apiKey', oauthValues, true)).toBe(true);
    expect(canApplyOnEnter(false, 'apiKey', oauthValues, false)).toBe(false);
  });

  it('Login tab (not connected): never applies, even with a stale/foreign apiKey sitting in values', () => {
    const staleApiKeyValues = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
    };
    expect(canApplyOnEnter(false, 'login', staleApiKeyValues, true)).toBe(
      false
    );
    expect(canApplyOnEnter(false, 'login', staleApiKeyValues, false)).toBe(
      false
    );
  });
});

describe('pageCredentials', () => {
  it('tells the page the kind of session and the project, never the key, for a proxy-capable SDK', () => {
    const page = pageCredentials(
      {
        apiUrl: 'https://app.tolgee.io',
        apiKey: 'tgpak_x',
        branch: 'feat',
        projectId: 3,
        projectKey: '3',
        siteKey: 'tgpak_site',
      },
      sdk(2)
    );
    expect(page).toEqual({
      apiUrl: 'https://app.tolgee.io',
      branch: 'feat',
      session: 'apiKey',
      projectId: 3,
      projectKey: '3',
    });
    expect(JSON.stringify(page)).not.toContain('tgpak');
  });

  it('hands the key itself to the page, without a session kind, when the SDK is too old to be proxied', () => {
    const page = pageCredentials(
      {
        apiUrl: 'https://app.tolgee.io',
        apiKey: 'tgpak_x',
        branch: 'feat',
        projectId: 3,
        projectKey: '3',
        siteKey: 'tgpak_site',
      },
      sdk(undefined)
    );
    expect(page).toEqual({
      apiKey: 'tgpak_x',
      apiUrl: 'https://app.tolgee.io',
      branch: 'feat',
      session: undefined,
      projectId: 3,
      projectKey: '3',
    });
  });

  it("decides delivery from the SDK's current protocol, so an updated SDK gets the key moved into the worker", () => {
    const values = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      projectId: 3,
      projectKey: '3',
    };
    const upgraded = pageCredentials(values, sdk(2));
    expect(upgraded.apiKey).toBeUndefined();
    expect(upgraded.session).toBe('apiKey');

    const downgraded = pageCredentials(values, sdk(undefined));
    expect(downgraded.apiKey).toBe('tgpak_x');
    expect(downgraded.session).toBeUndefined();
  });

  it('never hands a signed-in session to the page, whatever the SDK protocol', () => {
    const oauthValues = {
      apiUrl: 'https://app.tolgee.io',
      oauth: true,
      projectId: 3,
      projectKey: '3',
    };
    for (const libConfig of [sdk(undefined), sdk(2)]) {
      const page = pageCredentials(oauthValues, libConfig);
      expect(page.apiKey).toBeUndefined();
      expect(page.session).toBe('oauth');
    }
  });

  it('marks a signed-in session as oauth', () => {
    expect(
      pageCredentials(
        {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectId: 3,
          projectKey: '3',
        },
        sdk(2)
      )
    ).toEqual({
      apiUrl: 'https://app.tolgee.io',
      branch: undefined,
      session: 'oauth',
      projectId: 3,
      projectKey: '3',
    });
  });

  it('is empty (clear everything) without a valid credential', () => {
    expect(pageCredentials(null, sdk(2))).toEqual({});
    expect(pageCredentials(undefined, sdk(2))).toEqual({});
    expect(
      pageCredentials({ apiUrl: 'https://app.tolgee.io' }, sdk(2))
    ).toEqual({});
  });
});

describe('pageEditing', () => {
  const session = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' };

  it('tells the page editing is off once the user switched it off here', () => {
    expect(
      pageEditing({
        storedValues: session,
        appliedValues: null,
        editingSwitchedOff: true,
      })
    ).toBe('off');
  });

  it('clears the slot with a fresh apply, whatever the switch did before', () => {
    for (const editingSwitchedOff of [true, false]) {
      expect(
        pageEditing({
          storedValues: session,
          appliedValues: session,
          editingSwitchedOff,
        })
      ).toBeNull();
    }
  });

  it('clears the slot when the session is removed', () => {
    expect(
      pageEditing({
        storedValues: null,
        appliedValues: null,
        editingSwitchedOff: false,
      })
    ).toBeNull();
  });

  it('leaves the slot alone when a stored session is only restored, not applied on this page', () => {
    expect(
      pageEditing({
        storedValues: session,
        appliedValues: null,
        editingSwitchedOff: false,
      })
    ).toBeUndefined();
  });
});

describe('appliedValuesFrom', () => {
  const page = {
    apiUrl: 'https://app.tolgee.io',
    branch: 'feat',
    session: 'apiKey' as const,
    projectId: '3',
    projectKey: '3',
  };
  const stored = {
    apiUrl: 'https://app.tolgee.io/',
    apiKey: 'tgpak_x',
    projectId: 3,
    projectKey: '3',
    siteKey: 'tgpak_site',
  };

  it('completes an api-key session the page reports with the key from the origin record', () => {
    expect(appliedValuesFrom(page, stored)).toEqual({
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      branch: 'feat',
      projectId: 3,
      projectKey: '3',
    });
  });

  it('does not trust a record for another server, another project, or an OAuth record', () => {
    const noKey = (values: ReturnType<typeof appliedValuesFrom>) =>
      expect(values.apiKey).toBeUndefined();
    noKey(appliedValuesFrom(page, { ...stored, apiUrl: 'https://o.example' }));
    noKey(appliedValuesFrom(page, { ...stored, projectKey: '4' }));
    noKey(appliedValuesFrom(page, { ...stored, oauth: true }));
    noKey(appliedValuesFrom(page, null));
    expect(validateValues(appliedValuesFrom(page, null))).toBeNull();
  });

  it('takes a key the page holds itself as a page delivery, without needing the record', () => {
    const delivered = { ...page, session: null, apiKey: 'tgpak_page' };
    expect(appliedValuesFrom(delivered, null)).toEqual({
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_page',
      branch: 'feat',
      projectId: 3,
      projectKey: '3',
    });
    expect(appliedValuesFrom(delivered, stored).apiKey).toBe('tgpak_page');
  });

  it('reports an OAuth session as such', () => {
    expect(appliedValuesFrom({ ...page, session: 'oauth' }, stored)).toEqual({
      apiUrl: 'https://app.tolgee.io',
      branch: 'feat',
      oauth: true,
      projectId: 3,
      projectKey: '3',
    });
  });

  it('reports nothing applied for a page without a session', () => {
    expect(
      validateValues(appliedValuesFrom({ apiUrl: null, session: null }, stored))
    ).toBeNull();
    expect(appliedValuesFrom(undefined, stored).projectId).toBeUndefined();
  });
});

describe('activeValuesOf / hasSessionOf / siteKeyOf', () => {
  const values = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_form' };
  const stored = {
    apiUrl: 'https://app.tolgee.io',
    apiKey: 'tgpak_stored',
    siteKey: 'tgpak_site',
  };
  const applied = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_applied' };
  const devPage: LibConfig = {
    uiPresent: true,
    mode: 'development',
    config: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_form' },
  };

  it('prefers applied over stored over the form values', () => {
    expect(
      activeValuesOf({ values, storedValues: stored, appliedValues: applied })
    ).toBe(applied);
    expect(
      activeValuesOf({ values, storedValues: stored, appliedValues: null })
    ).toBe(stored);
    expect(
      activeValuesOf({ values, storedValues: null, appliedValues: null })
    ).toBe(values);
  });

  it('has a session with either a stored or an applied record', () => {
    expect(
      hasSessionOf({ values, storedValues: stored, appliedValues: null })
    ).toBe(true);
    expect(
      hasSessionOf({ values, storedValues: null, appliedValues: applied })
    ).toBe(true);
    expect(
      hasSessionOf({ values, storedValues: null, appliedValues: null })
    ).toBe(false);
  });

  it('takes the site key from the stored record while a session exists, the applied one only without a stored copy', () => {
    expect(
      siteKeyOf(
        { values, storedValues: stored, appliedValues: applied },
        devPage
      )
    ).toBe('tgpak_site');
    expect(
      siteKeyOf(
        {
          values,
          storedValues: null,
          appliedValues: { ...applied, siteKey: 'tgpak_applied_site' },
        },
        devPage
      )
    ).toBe('tgpak_applied_site');
  });

  it("without a session, the site key is the page's own development-mode key, if any", () => {
    const slots = { values, storedValues: null, appliedValues: null };
    expect(siteKeyOf(slots, devPage)).toBe('tgpak_form');
    expect(
      siteKeyOf(slots, { ...devPage, mode: 'production' })
    ).toBeUndefined();
    expect(
      siteKeyOf(
        { ...slots, values: { apiUrl: 'https://app.tolgee.io' } },
        devPage
      )
    ).toBeUndefined();
  });
});
