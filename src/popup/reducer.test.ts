import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { LibConfig } from '../types';
import {
  Action,
  createReducer,
  initialState,
  ProjectInfo,
  State,
} from './reducer';

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
        values: { apiUrl: 'https://app.tolgee.io', authToken: 'jwt' },
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
      expect(next.values?.authToken).toBe('jwt');
      expect(next.values?.apiKey).toBeUndefined();
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
          authToken: 'jwt',
          projectId: 7,
          projectKey: '7',
        },
      });
      expect(next.values).toEqual({
        apiUrl: 'https://app.tolgee.io',
        authToken: 'jwt',
        projectId: 7,
        projectKey: '7',
      });
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
        apiKey: 'tgpak_x',
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

    it('preserves the OAuth token and project (Enter in the Server field must not drop them)', () => {
      const oauth: State = {
        ...initialState,
        values: {
          apiUrl: 'https://app.tolgee.io',
          authToken: 'access-token',
          projectId: 7,
        },
      };
      const next = reduce(oauth, { type: 'APPLY_VALUES' });
      expect(next.appliedValues?.authToken).toBe('access-token');
      expect(next.appliedValues?.projectId).toBe(7);
      expect(next.storedValues?.authToken).toBe('access-token');
      expect(next.storedValues?.projectId).toBe(7);
    });
  });

  describe('CLEAR_ALL', () => {
    it('wipes credentials and lib config', () => {
      const dirty: State = {
        ...initialState,
        values: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
        appliedValues: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
        storedValues: { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' },
        libConfig: lib({}),
      };
      const next = reduce(dirty, { type: 'CLEAR_ALL' });
      expect(next.values).toBeNull();
      expect(next.storedValues).toBeNull();
      expect(next.appliedValues).toBeUndefined();
      expect(next.libConfig).toBeNull();
      expect(apply).toHaveBeenCalledOnce();
    });
  });

  describe('STORE_VALUES / LOAD_VALUES restore roundtrip', () => {
    const applied = { apiUrl: 'https://app.tolgee.io', apiKey: 'tgpak_x' };

    it('STORE_VALUES promotes appliedValues to stored and clears applied', () => {
      const next = reduce(
        { ...initialState, appliedValues: applied },
        { type: 'STORE_VALUES' }
      );
      expect(next.storedValues).toEqual(applied);
      expect(next.values).toEqual(applied);
      expect(next.appliedValues).toBeNull();
      expect(apply).toHaveBeenCalledOnce();
    });

    it('LOAD_VALUES restores the stored session into values and applied', () => {
      const next = reduce(
        { ...initialState, storedValues: applied },
        { type: 'LOAD_VALUES' }
      );
      expect(next.appliedValues).toEqual(applied);
      expect(next.values).toEqual(applied);
      expect(next.storedValues).toEqual(applied);
      expect(apply).toHaveBeenCalledOnce();
    });
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
      values: { apiUrl: 'https://app.tolgee.io', authToken: 'jwt' },
    };

    it('binds the resolved declared project into the stored session without applying it while switched off', () => {
      const next = reduce(connected, {
        type: 'RESOLVE_PROJECT',
        payload: { project: { id: 7, name: 'Demo' }, inaccessible: false },
      });
      expect(next.declaredProject).toEqual({ id: 7, name: 'Demo' });
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
        appliedValues: { apiUrl: 'https://app.tolgee.io', authToken: 'jwt' },
      };
      const next = reduce(applied, {
        type: 'RESOLVE_PROJECT',
        payload: { project: { id: 7, name: 'Demo' }, inaccessible: false },
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
  });

  it('throws on an unknown action', () => {
    expect(() =>
      reduce(initialState, { type: 'NOPE' } as unknown as Action)
    ).toThrow();
  });
});
