import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibConfig } from '../types';
import {
  Action,
  createReducer,
  initialState,
  ProjectInfo,
  State,
} from './reducer';

const lib = (overrides: Partial<LibConfig>): LibConfig =>
  ({
    uiPresent: true,
    mode: 'production',
    config: { apiUrl: 'https://app.tolgee.io', apiKey: '' },
    ...overrides,
  }) as unknown as LibConfig;

describe('detector reducer', () => {
  let apply: ReturnType<typeof vi.fn>;
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
            config: { apiUrl: 'https://x.io', apiKey: '' } as any,
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
        payload: { libData: lib({ uiPresent: undefined as any }), frameId: 0 },
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
    it('applies the token and preserves a previously picked project', () => {
      const restored: State = {
        ...initialState,
        values: { apiUrl: 'https://app.tolgee.io', projectId: 42 },
      };
      const next = reduce(restored, {
        type: 'OAUTH_APPLY',
        payload: { apiUrl: 'https://app.tolgee.io', authToken: 'jwt' },
      });
      expect(next.values).toEqual({
        apiUrl: 'https://app.tolgee.io',
        authToken: 'jwt',
        projectId: 42,
      });
      expect(next.appliedValues).toEqual(next.values);
      expect(next.storedValues).toEqual(next.values);
      expect(apply).toHaveBeenCalledOnce();
    });
  });

  describe('OAUTH_SET_PROJECT', () => {
    it('sets the project across values/applied/stored', () => {
      const connected: State = {
        ...initialState,
        values: { apiUrl: 'https://app.tolgee.io', authToken: 'jwt' },
      };
      const next = reduce(connected, {
        type: 'OAUTH_SET_PROJECT',
        payload: { projectId: 7 },
      });
      expect(next.values?.projectId).toBe(7);
      expect(next.appliedValues?.projectId).toBe(7);
      expect(next.storedValues?.projectId).toBe(7);
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

    it('binds the resolved declared project and injects its id', () => {
      const next = reduce(connected, {
        type: 'RESOLVE_PROJECT',
        payload: { project: { id: 7, name: 'Demo' }, inaccessible: false },
      });
      expect(next.declaredProject).toEqual({ id: 7, name: 'Demo' });
      expect(next.declaredProjectInaccessible).toBe(false);
      expect(next.values?.projectId).toBe(7);
      expect(next.appliedValues?.projectId).toBe(7);
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
