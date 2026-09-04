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

export const isProjectInfo = (c: CredentialsCheck): c is ProjectInfo =>
  c !== null && typeof c === 'object' && 'projectName' in c;

export const isOAuthUser = (c: CredentialsCheck): c is OAuthUser =>
  c !== null && typeof c === 'object' && 'oauth' in c;

export type TolgeePresent = 'loading' | 'present' | 'not_present' | 'legacy';

export type BranchOption = {
  name: string;
  isDefault: boolean;
};

export type ProjectOption = {
  id: number;
  name: string;
  branchingEnabled: boolean;
};

// The project whose branches the popup can offer, or null when the connected project has no branching.
export const branchableProjectId = (
  check: CredentialsCheck,
  declaredProject: ProjectOption | null
): number | null => {
  if (isProjectInfo(check)) {
    return check.branchingEnabled ? check.projectId : null;
  }
  if (isOAuthUser(check) && declaredProject?.branchingEnabled) {
    return declaredProject.id;
  }
  return null;
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
  // Not the page's raw declared id: it is that id resolved against the connected server into a real project.
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
  | {
      type: 'OAUTH_APPLY';
      payload: {
        apiUrl: string;
        authToken: string;
        projectId: number;
        projectKey: string;
      };
    }
  | { type: 'SET_BRANCHES'; payload: BranchOption[] | null }
  | {
      type: 'RESOLVE_PROJECT';
      payload: { project: ProjectOption | null; inaccessible: boolean };
    };

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
        // Only a second frame that itself carries a config counts as another instance: the not-detected timeout
        // dispatches a null config with no frame, and a repeat from the same frame is an update.
        if (
          libData &&
          state.libConfig !== null &&
          state.frameId !== null &&
          frameId !== null &&
          state.frameId !== frameId
        ) {
          return {
            ...state,
            error: 'Detected multiple Tolgee instances',
          };
        }
        if (!libData && state.libConfig !== null) {
          return state;
        }
        return {
          ...state,
          libConfig: libData,
          frameId,
          error: libData ? null : state.error,
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
        apply();
        const branchEnabled =
          branchableProjectId(state.credentialsCheck, state.declaredProject) !==
          null;
        const effectiveBranch = branchEnabled
          ? state.values?.branch
          : undefined;
        const nextValues = {
          apiKey: state.values?.apiKey,
          apiUrl: state.values?.apiUrl,
          branch: effectiveBranch,
          authToken: state.values?.authToken,
          projectId: state.values?.projectId,
          projectKey: state.values?.projectKey,
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
        const oauthValues = {
          apiUrl: action.payload.apiUrl,
          authToken: action.payload.authToken,
          projectId: action.payload.projectId,
          projectKey: action.payload.projectKey,
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
      case 'RESOLVE_PROJECT': {
        const { project, inaccessible } = action.payload;
        if (!project) {
          return {
            ...state,
            declaredProject: null,
            declaredProjectInaccessible: inaccessible,
          };
        }
        apply();
        const oauthValues = { ...state.values, projectId: project.id };
        // Never re-apply a session the user switched off: doing so would fight the Applied toggle and flicker the popup.
        const isApplied = state.appliedValues != null;
        return {
          ...state,
          declaredProject: project,
          declaredProjectInaccessible: false,
          values: oauthValues,
          appliedValues: isApplied ? oauthValues : state.appliedValues,
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
        // @ts-expect-error action type is unknown
        throw new Error(`Unknown action ${action.type}`);
    }
  };
