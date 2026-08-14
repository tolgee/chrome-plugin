import { LibConfig } from '../types';
import { validateValues, Values } from './tools';

export type ProjectInfo = {
  projectName: string;
  projectId: number;
  scopes: string[];
  userFullName: string;
  branchingEnabled: boolean;
};

export type OAuthUser = {
  oauth: true;
  userFullName: string;
};

export type CredentialsCheck =
  | null
  | 'loading'
  | 'invalid'
  | ProjectInfo
  | OAuthUser;
export type TolgeePresent = 'loading' | 'present' | 'not_present' | 'legacy';

export type BranchOption = {
  name: string;
  isDefault: boolean;
};

export type ProjectOption = {
  id: number;
  name: string;
};

export const initialState = {
  values: null as Values | null,
  storedValues: null as Values | null,
  appliedValues: null as Values | null | undefined,
  tolgeePresent: 'loading' as TolgeePresent,
  credentialsCheck: null as CredentialsCheck,
  libConfig: null as LibConfig | null,
  error: null as string | null,
  frameId: null as number | null,
  branches: null as BranchOption[] | null,
  // The project the page declared (via its Tolgee config), resolved against the connected server: the project when the
  // user can edit it there, or `declaredProjectInaccessible` when they can't (wrong id / no access).
  declaredProject: null as ProjectOption | null,
  declaredProjectInaccessible: false,
};

export type State = typeof initialState;
export type Action =
  | { type: 'CHANGE_VALUES'; payload: Partial<Values> }
  | {
      type: 'CHANGE_LIB_CONFIG';
      payload: { libData: LibConfig | null; frameId: number | null };
    }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_APPLIED_VALUES'; payload: Values | null }
  | { type: 'SET_CREDENTIALS_CHECK'; payload: CredentialsCheck }
  | { type: 'LOAD_STORED_VALUES'; payload: Values | null }
  | { type: 'APPLY_VALUES' }
  | { type: 'CLEAR_ALL' }
  | { type: 'STORE_VALUES' }
  | { type: 'LOAD_VALUES' }
  | { type: 'OAUTH_APPLY'; payload: { apiUrl: string; authToken: string } }
  | { type: 'OAUTH_SET_PROJECT'; payload: { projectId: number | undefined } }
  | { type: 'SET_BRANCHES'; payload: BranchOption[] | null }
  | {
      type: 'RESOLVE_PROJECT';
      payload: { project: ProjectOption | null; inaccessible: boolean };
    };

/**
 * The reducer is a pure state transition, but a few actions also need to flag that the new state must be synced out to
 * storage/sessionStorage. That side effect is injected as `apply` so the reducer stays testable without React.
 */
export const createReducer =
  (apply: () => void) =>
  (state: State, action: Action): State => {
    switch (action.type) {
      case 'CHANGE_VALUES':
        return { ...state, values: { ...state.values, ...action.payload } };
      case 'CHANGE_LIB_CONFIG': {
        const { libData, frameId } = action.payload;
        const newValues = {
          apiKey: libData?.config?.apiKey,
          apiUrl: libData?.config?.apiUrl,
          branch: libData?.config?.branch,
        };
        if (state.libConfig !== null && state.frameId !== frameId) {
          return {
            ...state,
            error: 'Detected multiple Tolgee instances',
          };
        }
        return {
          ...state,
          libConfig: libData,
          frameId,
          values: validateValues(state.values) || newValues,
          tolgeePresent: !libData
            ? 'not_present'
            : libData.uiPresent === undefined
              ? 'legacy'
              : 'present',
        };
      }
      case 'SET_ERROR':
        return {
          ...state,
          tolgeePresent: 'not_present',
          error: action.payload,
        };
      case 'SET_APPLIED_VALUES':
        return {
          ...state,
          appliedValues: action.payload,
        };
      case 'SET_CREDENTIALS_CHECK':
        return {
          ...state,
          credentialsCheck: action.payload,
        };
      case 'LOAD_STORED_VALUES':
        return {
          ...state,
          storedValues: action.payload,
          values: action.payload,
        };
      case 'APPLY_VALUES': {
        // sync values with storage/localStorage
        apply();
        const branchEnabled =
          state.credentialsCheck !== null &&
          typeof state.credentialsCheck === 'object' &&
          'branchingEnabled' in state.credentialsCheck &&
          state.credentialsCheck.branchingEnabled;
        const effectiveBranch = branchEnabled
          ? state.values?.branch
          : undefined;
        // Carry the OAuth fields through: this action also fires on the Login tab (Enter in the Server field), and
        // dropping authToken/projectId there would wipe the token from state and remove the stored OAuth session.
        const nextValues = {
          apiKey: state.values?.apiKey,
          apiUrl: state.values?.apiUrl,
          branch: effectiveBranch,
          authToken: state.values?.authToken,
          projectId: state.values?.projectId,
        };
        return {
          ...state,
          appliedValues: nextValues,
          storedValues: nextValues,
        };
      }
      case 'CLEAR_ALL': {
        apply();
        return {
          ...state,
          appliedValues: undefined,
          storedValues: null,
          values: null,
          libConfig: null,
          declaredProject: null,
          declaredProjectInaccessible: false,
        };
      }
      case 'OAUTH_APPLY': {
        apply();
        // Keep any project the user already picked for this backend (restored from storage) across a re-connect.
        const oauthValues = {
          apiUrl: action.payload.apiUrl,
          authToken: action.payload.authToken,
          projectId: state.values?.projectId,
        };
        return {
          ...state,
          values: oauthValues,
          appliedValues: oauthValues,
          storedValues: oauthValues,
          declaredProject: null,
          declaredProjectInaccessible: false,
        };
      }
      case 'OAUTH_SET_PROJECT': {
        apply();
        const oauthValues = {
          ...state.values,
          projectId: action.payload.projectId,
        };
        return {
          ...state,
          values: oauthValues,
          appliedValues: oauthValues,
          storedValues: oauthValues,
        };
      }
      case 'RESOLVE_PROJECT': {
        const { project, inaccessible } = action.payload;
        if (!project) {
          return {
            ...state,
            declaredProject: null,
            declaredProjectInaccessible: inaccessible,
          };
        }
        // Bind the declared project so in-context editing has a target: an all-projects token carries none, and even a
        // single-project token needs the id sent explicitly on every request.
        apply();
        const oauthValues = { ...state.values, projectId: project.id };
        return {
          ...state,
          declaredProject: project,
          declaredProjectInaccessible: false,
          values: oauthValues,
          appliedValues: oauthValues,
          storedValues: oauthValues,
        };
      }
      case 'STORE_VALUES':
        apply();
        return {
          ...state,
          storedValues: state.appliedValues || null,
          values: state.appliedValues || null,
          appliedValues: null,
        };
      case 'LOAD_VALUES':
        apply();
        return {
          ...state,
          appliedValues: state.storedValues,
          values: state.storedValues,
        };
      case 'SET_BRANCHES':
        return {
          ...state,
          branches: action.payload,
        };
      default:
        // @ts-expect-error action type is type uknown
        throw new Error(`Unknown action ${action.type}`);
    }
  };
