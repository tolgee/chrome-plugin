import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { LibConfig } from '../types';
import { createReducer, initialState } from './reducer';
import {
  Action,
  branchableProjectId,
  keyProjectId,
  keyProjectPending,
  ProjectInfo,
  State,
} from './popupState';

// A project API key carrying its own project id (1), the same key oauth/apiKeyProject.test.ts decodes.
const KEY_FOR_PROJECT_1 = 'tgpak_gfpxm4lin4zdazleoq4gm2rumfxgi2lfom2gw4dpguzxc';
// A key from before project ids were embedded: only the credentials check can say which project it opens.
const LEGACY_KEY = 'legacykey';

const lib = (
  overrides: Partial<Omit<LibConfig, 'config'>> & {
    config?: Partial<LibConfig['config']>;
  }
): LibConfig => ({
  uiPresent: true,
  mode: 'production',
  ...overrides,
  config: { apiUrl: 'https://app.tolgee.io', apiKey: '', ...overrides.config },
});

describe('detector reducer', () => {
  let apply: Mock<() => void>;
  let reduce: (state: State, action: Action) => State;

  beforeEach(() => {
    apply = vi.fn();
    reduce = createReducer(apply);
  });

  describe('CHANGE_LIB_CONFIG', () => {
    it('marks Tolgee present and seeds values from the page config', () => {
      const next = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: {
          libData: lib({
            config: { apiUrl: 'https://x.io', apiKey: '' },
          }),
          frameId: 0,
        },
      });
      expect(next.tolgeePresent).toBe('present');
      expect(next.values?.apiUrl).toBe('https://x.io');
    });

    it('reports legacy when uiPresent is missing', () => {
      const next = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({ uiPresent: undefined }), frameId: 0 },
      });
      expect(next.tolgeePresent).toBe('legacy');
    });

    it('reports not_present when there is no lib data', () => {
      const next = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: null, frameId: 0 },
      });
      expect(next.tolgeePresent).toBe('not_present');
    });

    it('preserves a restored OAuth session instead of overwriting it with the page config', () => {
      const restored: State = {
        ...initialState,
        values: { apiUrl: 'https://app.tolgee.io', oauth: true },
      };
      const next = reduce(restored, {
        type: 'CHANGE_LIB_CONFIG',
        payload: {
          libData: lib({
            config: { apiUrl: 'https://x.io', apiKey: 'tgpak_x' },
          }),
          frameId: 0,
        },
      });
      expect(next.values?.oauth).toBe(true);
      expect(next.values?.apiKey).toBeUndefined();
    });

    it('keeps the top frame (id 0) as the single instance across repeats and the not-detected timeout', () => {
      const first = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 0 },
      });
      const afterTimeout = reduce(first, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: null, frameId: null },
      });
      expect(afterTimeout.error).toBeNull();
      expect(afterTimeout.tolgeePresent).toBe('present');

      const repeated = reduce(afterTimeout, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 0 },
      });
      expect(repeated.error).toBeNull();
      expect(repeated.tolgeePresent).toBe('present');
    });

    it('reports multiple instances only when a second frame also carries a config', () => {
      const top = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 0 },
      });
      const second = reduce(top, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 7 },
      });
      expect(second.error).toBe('Detected multiple Tolgee instances');
    });

    it('clears a detection error once a config arrives', () => {
      const errored = reduce(initialState, {
        type: 'SET_ERROR',
        payload: 'No access to this page, try to refresh',
      });
      expect(errored.error).toBe('No access to this page, try to refresh');
      expect(errored.tolgeePresent).toBe('not_present');

      const recovered = reduce(errored, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 0 },
      });
      expect(recovered.error).toBeNull();
      expect(recovered.tolgeePresent).toBe('present');
    });

    it('keeps a detection error when the no-config timeout fires', () => {
      const errored = reduce(initialState, {
        type: 'SET_ERROR',
        payload: 'No access to this page, try to refresh',
      });
      const next = reduce(errored, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: null, frameId: null },
      });
      expect(next.error).toBe('No access to this page, try to refresh');
    });

    it('errors when a second instance is detected in another frame', () => {
      const first = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 0 },
      });
      const second = reduce(first, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: lib({}), frameId: 1 },
      });
      expect(second.error).toBe('Detected multiple Tolgee instances');
    });
  });

  describe('OAUTH_APPLY', () => {
    it('applies the connect-flow payload as the new values, applied and stored', () => {
      const restored: State = {
        ...initialState,
        values: { apiUrl: 'https://app.tolgee.io', projectId: 42 },
      };
      const next = reduce(restored, {
        type: 'OAUTH_APPLY',
        payload: {
          apiUrl: 'https://app.tolgee.io',
          projectId: 7,
          projectKey: '7',
        },
      });
      expect(next.values).toEqual({
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectId: 7,
        projectKey: '7',
      });
      expect(JSON.stringify(next)).not.toContain('token');
      expect(next.appliedValues).toEqual(next.values);
      expect(next.storedValues).toEqual(next.values);
      expect(apply).toHaveBeenCalledOnce();
    });
  });

  describe('APPLY_VALUES', () => {
    const withBranch: State = {
      ...initialState,
      values: {
        apiUrl: 'https://app.tolgee.io',
        apiKey: KEY_FOR_PROJECT_1,
        branch: 'feature',
      },
    };

    it('drops the branch when branching is disabled', () => {
      const next = reduce(withBranch, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.branch).toBeUndefined();
      expect(apply).toHaveBeenCalledOnce();
    });

    it('keeps the branch when branching is enabled', () => {
      const enabled: State = {
        ...withBranch,
        credentialsCheck: {
          projectName: 'Demo',
          projectId: 2,
          scopes: [],
          userFullName: 'Jo',
          branchingEnabled: true,
        } as ProjectInfo,
      };
      const next = reduce(enabled, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.branch).toBe('feature');
    });

    it('keeps the branch for an OAuth session whose declared project has branching', () => {
      const oauth: State = {
        ...initialState,
        values: {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectId: 7,
          branch: 'feature',
        },
        credentialsCheck: { oauth: true, userFullName: 'Jo' },
        declaredProject: { id: 7, name: 'Demo', branchingEnabled: true },
      };
      const next = reduce(oauth, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.branch).toBe('feature');
      expect(next.storedValues?.branch).toBe('feature');
    });

    it('drops the branch for an OAuth session whose declared project has no branching', () => {
      const oauth: State = {
        ...initialState,
        values: {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectId: 7,
          branch: 'feature',
        },
        credentialsCheck: { oauth: true, userFullName: 'Jo' },
        declaredProject: { id: 7, name: 'Demo', branchingEnabled: false },
      };
      const next = reduce(oauth, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.branch).toBeUndefined();
    });

    it('resetting the override (empty branch) applies without a branch', () => {
      const withOverride: State = {
        ...initialState,
        values: {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectId: 7,
          branch: 'feature',
        },
        appliedValues: {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectId: 7,
          branch: 'feature',
        },
        credentialsCheck: { oauth: true, userFullName: 'Jo' },
        declaredProject: { id: 7, name: 'Demo', branchingEnabled: true },
      };
      const cleared = reduce(withOverride, {
        type: 'CHANGE_VALUES',
        payload: { branch: '' },
      });
      const next = reduce(cleared, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.branch).toBeFalsy();
      expect(next.storedValues?.branch).toBeFalsy();
      expect(next.appliedValues?.oauth).toBe(true);
      expect(apply).toHaveBeenCalledOnce();
    });

    it('preserves the signed-in flag and project (Enter in the Server field must not drop them)', () => {
      const oauth: State = {
        ...initialState,
        values: {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectId: 7,
        },
      };
      const next = reduce(oauth, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.oauth).toBe(true);
      expect(next.appliedValues?.projectId).toBe(7);
      expect(next.storedValues?.oauth).toBe(true);
      expect(next.storedValues?.projectId).toBe(7);
    });
  });

  describe('pinning an api-key session to a project', () => {
    const check: ProjectInfo = {
      projectName: 'Demo',
      projectId: 9,
      scopes: [],
      userFullName: 'U',
      branchingEnabled: false,
    };
    const stateWith = (
      apiKey: string,
      credentialsCheck: State['credentialsCheck']
    ): State => ({
      ...initialState,
      values: { apiUrl: 'https://app.tolgee.io', apiKey },
      credentialsCheck,
    });

    it("APPLY_VALUES pins to the key's own project without waiting for the check", () => {
      const next = reduce(stateWith(KEY_FOR_PROJECT_1, 'loading'), {
        type: 'APPLY_VALUES',
      });
      expect(next.appliedValues).toMatchObject({
        projectId: 1,
        projectKey: '1',
      });
      expect(next.storedValues).toMatchObject({
        projectId: 1,
        projectKey: '1',
      });
      expect(apply).toHaveBeenCalledOnce();
    });

    it('APPLY_VALUES pins a legacy key to the project the settled check reported', () => {
      const next = reduce(stateWith(LEGACY_KEY, check), {
        type: 'APPLY_VALUES',
      });
      expect(next.appliedValues).toMatchObject({
        projectId: 9,
        projectKey: '9',
      });
      expect(next.storedValues).toMatchObject({
        projectId: 9,
        projectKey: '9',
      });
    });

    it('APPLY_VALUES applies nothing while a legacy key has no project yet', () => {
      const next = reduce(stateWith(LEGACY_KEY, 'loading'), {
        type: 'APPLY_VALUES',
      });
      expect(next.appliedValues).toBeNull();
      expect(next.storedValues).toBeNull();
      expect(apply).not.toHaveBeenCalled();
    });

    it("SWITCH_EDITING_ON pins to the key's own project without waiting for the check", () => {
      const stored = {
        apiUrl: 'https://app.tolgee.io',
        apiKey: KEY_FOR_PROJECT_1,
      };
      const next = reduce(
        { ...initialState, storedValues: stored, credentialsCheck: 'loading' },
        { type: 'SWITCH_EDITING_ON' }
      );
      expect(next.appliedValues).toEqual({
        ...stored,
        projectId: 1,
        projectKey: '1',
      });
      expect(apply).toHaveBeenCalledOnce();
    });

    it('SWITCH_EDITING_ON keeps editing off while a legacy key has no project yet', () => {
      const next = reduce(
        {
          ...initialState,
          storedValues: { apiUrl: 'https://app.tolgee.io', apiKey: LEGACY_KEY },
          credentialsCheck: 'loading',
        },
        { type: 'SWITCH_EDITING_ON' }
      );
      expect(next.appliedValues).toBeNull();
      expect(apply).not.toHaveBeenCalled();
    });

    it('keyProjectPending says so only while the project is still unknown', () => {
      const legacy = { apiUrl: 'https://app.tolgee.io', apiKey: LEGACY_KEY };
      expect(keyProjectPending(legacy, 'loading')).toBe(true);
      expect(keyProjectPending(legacy, check)).toBe(false);
      expect(keyProjectPending({ ...legacy, projectKey: '3' }, 'loading')).toBe(
        false
      );
      expect(
        keyProjectPending(
          { apiUrl: 'https://app.tolgee.io', apiKey: KEY_FOR_PROJECT_1 },
          'loading'
        )
      ).toBe(false);
      expect(
        keyProjectPending(
          { apiUrl: 'https://app.tolgee.io', oauth: true },
          null
        )
      ).toBe(false);
    });

    it('keyProjectId takes the project encoded in the key over the one the check reported', () => {
      expect(keyProjectId(KEY_FOR_PROJECT_1, check)).toBe(1);
    });

    it('keyProjectId falls back to the check for a key that encodes none', () => {
      expect(keyProjectId(LEGACY_KEY, check)).toBe(9);
    });

    it('keyProjectId knows no project while the key is unverified', () => {
      expect(keyProjectId(LEGACY_KEY, 'loading')).toBeUndefined();
      expect(keyProjectId(undefined, null)).toBeUndefined();
    });
  });

  describe('CLEAR_ALL', () => {
    const page = lib({
      config: { apiUrl: 'https://my.tolgee.io', apiKey: '' },
    });
    const dirty: State = {
      ...initialState,
      tolgeePresent: 'present',
      frameId: 0,
      values: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
      appliedValues: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
      storedValues: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
      libConfig: page,
      declaredProject: { id: 1, name: 'P', branchingEnabled: false },
      declaredProjectInaccessible: true,
    };

    it('wipes the credentials and the resolved project', () => {
      const next = reduce(dirty, { type: 'CLEAR_ALL' });
      expect(next.storedValues).toBeNull();
      expect(next.appliedValues).toBeNull();
      expect(next.declaredProject).toBeNull();
      expect(next.declaredProjectInaccessible).toBe(false);
      expect(apply).toHaveBeenCalledOnce();
    });

    // Regression: dropping the lib config let the not-detected timeout flip the popup to "not using Tolgee" after a
    // sign-out that did not reload the page (editing already off), and the sign-in screen lost the page's server.
    it('keeps the detected page config and falls back to the values the page declares', () => {
      const next = reduce(dirty, { type: 'CLEAR_ALL' });
      expect(next.libConfig).toBe(page);
      expect(next.frameId).toBe(0);
      expect(next.tolgeePresent).toBe('present');
      expect(next.values).toEqual({
        apiUrl: 'https://my.tolgee.io',
        apiKey: '',
        branch: undefined,
      });
    });
  });

  describe('overriding a key the page ships in its own code', () => {
    const devPage = lib({
      mode: 'development',
      config: { apiUrl: 'https://my.tolgee.io', apiKey: 'tgpak_site' },
    });

    it('starts from the site key, stores the typed key on apply and falls back to the site key when cleared', () => {
      const detected = reduce(initialState, {
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: devPage, frameId: 0 },
      });
      expect(detected.values?.apiKey).toBe('tgpak_site');
      expect(detected.storedValues).toBeNull();

      const emptied = reduce(detected, {
        type: 'CHANGE_VALUES',
        payload: { apiKey: '', siteKey: 'tgpak_site' },
      });
      expect(emptied.values?.apiUrl).toBe('https://my.tolgee.io');

      const typed = reduce(emptied, {
        type: 'CHANGE_VALUES',
        payload: { apiKey: KEY_FOR_PROJECT_1 },
      });
      const applied = reduce(typed, { type: 'APPLY_VALUES' });
      expect(applied.storedValues).toMatchObject({
        apiUrl: 'https://my.tolgee.io',
        apiKey: KEY_FOR_PROJECT_1,
        siteKey: 'tgpak_site',
      });
      expect(applied.appliedValues).toEqual(applied.storedValues);

      // The reloaded page reports the injected key as its own; the site key is restored from the stored record.
      const reloaded = reduce(applied, {
        type: 'CHANGE_LIB_CONFIG',
        payload: {
          libData: lib({
            mode: 'development',
            config: {
              apiUrl: 'https://my.tolgee.io',
              apiKey: KEY_FOR_PROJECT_1,
            },
          }),
          frameId: 0,
        },
      });
      const cleared = reduce(reloaded, { type: 'CLEAR_ALL' });
      expect(cleared.storedValues).toBeNull();
      expect(cleared.appliedValues).toBeNull();
      expect(cleared.values).toEqual({
        apiUrl: 'https://my.tolgee.io',
        apiKey: 'tgpak_site',
        branch: undefined,
      });
    });

    it('does not mistake the key it injected, still reported by the page, for a site key after Remove key', () => {
      const connected: State = {
        ...initialState,
        libConfig: lib({
          mode: 'development',
          config: { apiUrl: 'https://my.tolgee.io', apiKey: 'tgpak_own' },
        }),
        values: { apiUrl: 'https://my.tolgee.io', apiKey: 'tgpak_own' },
        appliedValues: { apiUrl: 'https://my.tolgee.io', apiKey: 'tgpak_own' },
        storedValues: { apiUrl: 'https://my.tolgee.io', apiKey: 'tgpak_own' },
      };
      const cleared = reduce(connected, { type: 'CLEAR_ALL' });
      expect(cleared.values).toEqual({
        apiUrl: 'https://my.tolgee.io',
        apiKey: '',
        branch: undefined,
      });
    });
  });

  describe('SWITCH_EDITING_OFF / SWITCH_EDITING_ON roundtrip', () => {
    const applied = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
      projectId: 7,
      projectKey: '7',
    };
    // A record from before api-key sessions were pinned to a project.
    const unpinned = { apiUrl: 'https://app.tolgee.io', apiKey: LEGACY_KEY };

    it('SWITCH_EDITING_OFF keeps the site key the stored record remembers when the page-reported applied values lack it', () => {
      const next = reduce(
        {
          ...initialState,
          appliedValues: applied,
          storedValues: { ...applied, siteKey: 'tgpak_site' },
        },
        { type: 'SWITCH_EDITING_OFF' }
      );
      expect(next.storedValues).toEqual({ ...applied, siteKey: 'tgpak_site' });
      expect(next.values).toEqual({ ...applied, siteKey: 'tgpak_site' });
      expect(next.appliedValues).toBeNull();
    });

    it('SWITCH_EDITING_OFF promotes appliedValues to stored and clears applied', () => {
      const next = reduce(
        { ...initialState, appliedValues: applied },
        { type: 'SWITCH_EDITING_OFF' }
      );
      expect(next.storedValues).toEqual(applied);
      expect(next.values).toEqual(applied);
      expect(next.appliedValues).toBeNull();
      expect(apply).toHaveBeenCalledOnce();
    });

    it('SWITCH_EDITING_OFF remembers that the user switched editing off here, and every apply or removal forgets it', () => {
      const off = reduce(
        { ...initialState, appliedValues: applied, storedValues: applied },
        { type: 'SWITCH_EDITING_OFF' }
      );
      expect(off.editingSwitchedOff).toBe(true);

      expect(
        reduce(off, { type: 'SWITCH_EDITING_ON' }).editingSwitchedOff
      ).toBe(false);
      expect(reduce(off, { type: 'CLEAR_ALL' }).editingSwitchedOff).toBe(false);
      expect(
        reduce({ ...off, values: applied }, { type: 'APPLY_VALUES' })
          .editingSwitchedOff
      ).toBe(false);
      expect(
        reduce(off, {
          type: 'OAUTH_APPLY',
          payload: {
            apiUrl: 'https://app.tolgee.io',
            projectId: 3,
            projectKey: '3',
          },
        }).editingSwitchedOff
      ).toBe(false);
    });

    it('restoring a stored session or resolving its project does not touch the switched-off memory', () => {
      const oauth = {
        apiUrl: 'https://app.tolgee.io',
        oauth: true,
        projectId: 3,
        projectKey: '3',
      };
      const off = reduce(
        { ...initialState, appliedValues: oauth, storedValues: oauth },
        { type: 'SWITCH_EDITING_OFF' }
      );
      const restored = reduce(off, {
        type: 'LOAD_STORED_VALUES',
        payload: oauth,
      });
      expect(restored.editingSwitchedOff).toBe(true);
      const resolved = reduce(restored, {
        type: 'RESOLVE_PROJECT',
        payload: {
          project: { id: 3, name: 'Demo', branchingEnabled: false },
          inaccessible: false,
        },
      });
      expect(resolved.editingSwitchedOff).toBe(true);
      expect(resolved.appliedValues).toBeNull();
    });

    it('SWITCH_EDITING_ON restores the stored session into values and applied', () => {
      const next = reduce(
        { ...initialState, storedValues: applied },
        { type: 'SWITCH_EDITING_ON' }
      );
      expect(next.appliedValues).toEqual(applied);
      expect(next.values).toEqual(applied);
      expect(next.storedValues).toEqual(applied);
      expect(apply).toHaveBeenCalledOnce();
    });

    it("SWITCH_EDITING_ON pins an unpinned api-key record to the key's project as the check reported it", () => {
      const check: ProjectInfo = {
        projectName: 'Demo',
        projectId: 9,
        scopes: [],
        userFullName: 'U',
        branchingEnabled: false,
      };
      const next = reduce(
        { ...initialState, storedValues: unpinned, credentialsCheck: check },
        { type: 'SWITCH_EDITING_ON' }
      );
      const pinned = { ...unpinned, projectId: 9, projectKey: '9' };
      expect(next.appliedValues).toEqual(pinned);
      expect(next.storedValues).toEqual(pinned);
    });

    it('SWITCH_EDITING_ON keeps the pin an api-key record already carries', () => {
      const check: ProjectInfo = {
        projectName: 'Demo',
        projectId: 9,
        scopes: [],
        userFullName: 'U',
        branchingEnabled: false,
      };
      const stored = { ...unpinned, projectId: 3, projectKey: '3' };
      const next = reduce(
        { ...initialState, storedValues: stored, credentialsCheck: check },
        { type: 'SWITCH_EDITING_ON' }
      );
      expect(next.appliedValues).toEqual(stored);
    });
  });

  it('SET_CONNECT_REFUSAL stores the parked refusal and OAUTH_APPLY drops it', () => {
    const refusal = {
      code: 'project_inaccessible' as const,
      projectId: 5,
      apiUrl: 'https://app.tolgee.io',
      at: 1,
    };
    const withRefusal = reduce(initialState, {
      type: 'SET_CONNECT_REFUSAL',
      payload: refusal,
    });
    expect(withRefusal.connectRefusal).toEqual(refusal);
    const connected = reduce(withRefusal, {
      type: 'OAUTH_APPLY',
      payload: {
        apiUrl: 'https://app.tolgee.io',
        projectId: 5,
        projectKey: '5',
      },
    });
    expect(connected.connectRefusal).toBeNull();
  });

  it('CHANGE_VALUES merges a partial patch', () => {
    const next = reduce(
      { ...initialState, values: { apiUrl: 'https://app.tolgee.io' } },
      { type: 'CHANGE_VALUES', payload: { apiKey: 'tgpak_x' } }
    );
    expect(next.values).toEqual({
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'tgpak_x',
    });
    expect(apply).not.toHaveBeenCalled();
  });

  describe('RESOLVE_PROJECT', () => {
    const connected: State = {
      ...initialState,
      values: { apiUrl: 'https://app.tolgee.io', oauth: true, projectKey: '7' },
    };

    it('binds the resolved declared project into the stored session without applying it while switched off', () => {
      const next = reduce(connected, {
        type: 'RESOLVE_PROJECT',
        payload: {
          project: { id: 7, name: 'Demo', branchingEnabled: false },
          inaccessible: false,
        },
      });
      expect(next.declaredProject).toEqual({
        id: 7,
        name: 'Demo',
        branchingEnabled: false,
      });
      expect(next.declaredProjectInaccessible).toBe(false);
      expect(next.values?.projectId).toBe(7);
      expect(next.storedValues?.projectId).toBe(7);
      // Applied toggle is off (no appliedValues): binding must not silently re-apply the session.
      expect(next.appliedValues).toBeNull();
      expect(apply).toHaveBeenCalledOnce();
    });

    it('re-applies the bound project when the session is currently applied', () => {
      const applied: State = {
        ...connected,
        appliedValues: { apiUrl: 'https://app.tolgee.io', oauth: true },
      };
      const next = reduce(applied, {
        type: 'RESOLVE_PROJECT',
        payload: {
          project: { id: 7, name: 'Demo', branchingEnabled: false },
          inaccessible: false,
        },
      });
      expect(next.appliedValues?.projectId).toBe(7);
      expect(next.storedValues?.projectId).toBe(7);
      expect(apply).toHaveBeenCalledOnce();
    });

    it('flags an inaccessible declared project without injecting', () => {
      const next = reduce(connected, {
        type: 'RESOLVE_PROJECT',
        payload: { project: null, inaccessible: true },
      });
      expect(next.declaredProjectInaccessible).toBe(true);
      expect(next.declaredProject).toBeNull();
      expect(next.values?.projectId).toBeUndefined();
      expect(apply).not.toHaveBeenCalled();
    });

    it('treats a resolved project outside the connected session as inaccessible rather than applying it', () => {
      const applied: State = {
        ...connected,
        appliedValues: {
          apiUrl: 'https://app.tolgee.io',
          oauth: true,
          projectKey: '7',
        },
      };
      const next = reduce(applied, {
        type: 'RESOLVE_PROJECT',
        payload: {
          project: { id: 9, name: 'Other', branchingEnabled: false },
          inaccessible: false,
        },
      });
      expect(next.declaredProject).toBeNull();
      expect(next.declaredProjectInaccessible).toBe(true);
      expect(next.values?.projectId).toBeUndefined();
      expect(next.appliedValues).toEqual(applied.appliedValues);
      expect(apply).not.toHaveBeenCalled();
    });

    it('never binds a resolved project into values that are no longer an OAuth session by the time it dispatches', () => {
      // The RESOLVE_PROJECT check ran against an earlier checkableValues snapshot; state.values has since become a
      // page-config fallback (no oauth flag, no projectKey), which must not pass the projectKey-mismatch check.
      const pageConfigState: State = {
        ...connected,
        values: { apiUrl: 'https://app.tolgee.io', projectId: 3 },
      };
      const next = reduce(pageConfigState, {
        type: 'RESOLVE_PROJECT',
        payload: {
          project: { id: 3, name: 'Demo', branchingEnabled: false },
          inaccessible: false,
        },
      });
      expect(next.declaredProject).toBeNull();
      expect(next.declaredProjectInaccessible).toBe(false);
      expect(next.values).toEqual(pageConfigState.values);
      expect(next.storedValues).toEqual(pageConfigState.storedValues);
      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe('branchableProjectId', () => {
    const projectInfo = (branchingEnabled: boolean): ProjectInfo => ({
      projectName: 'Demo',
      projectId: 2,
      scopes: [],
      userFullName: 'Jo',
      branchingEnabled,
    });

    it('uses the api key project when it has branching', () => {
      expect(branchableProjectId(projectInfo(true), null)).toBe(2);
      expect(branchableProjectId(projectInfo(false), null)).toBeNull();
    });

    it('uses the declared project on the OAuth path when it has branching', () => {
      const user = { oauth: true as const, userFullName: 'Jo' };
      expect(
        branchableProjectId(user, {
          id: 7,
          name: 'Demo',
          branchingEnabled: true,
        })
      ).toBe(7);
      expect(
        branchableProjectId(user, {
          id: 7,
          name: 'Demo',
          branchingEnabled: false,
        })
      ).toBeNull();
      expect(branchableProjectId(user, null)).toBeNull();
    });

    it('offers nothing while the credentials are unchecked or invalid', () => {
      expect(branchableProjectId(null, null)).toBeNull();
      expect(branchableProjectId('loading', null)).toBeNull();
      expect(branchableProjectId('invalid', null)).toBeNull();
    });
  });

  describe('api-key delivery', () => {
    const keyValues = {
      apiUrl: 'https://app.tolgee.io',
      apiKey: KEY_FOR_PROJECT_1,
    };

    it('APPLY_VALUES records the key without a delivery: how it reaches the page is decided from the SDK each time', () => {
      const next = reduce(
        { ...initialState, libConfig: lib({}), values: keyValues },
        { type: 'APPLY_VALUES' }
      );
      expect(next.appliedValues).not.toHaveProperty('delivery');
      expect(next.storedValues).not.toHaveProperty('delivery');
    });
  });

  it('throws on an unknown action', () => {
    expect(() =>
      reduce(initialState, { type: 'NOPE' } as unknown as Action)
    ).toThrow();
  });
});
