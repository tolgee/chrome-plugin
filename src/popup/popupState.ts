import { LibConfig } from '../types';
import { projectIdOfApiKey } from '../oauth/apiKeyProject';
import { StoredConnectRefusal } from '../oauth/connectRefusalStore';
import { Values } from './tools';

export type ProjectInfo = {
  projectName: string;
  projectId: number;
  scopes: string[];
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
  | 'unreachable'
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

export const keyProjectId = (
  apiKey: string | undefined,
  check: CredentialsCheck
): number | undefined =>
  projectIdOfApiKey(apiKey) ??
  (isProjectInfo(check) ? check.projectId : undefined);

// A legacy key carries no project of its own, so until the check answers there is nothing to pin the session to.
export const keyProjectPending = (
  values: Values | null,
  check: CredentialsCheck
): boolean =>
  Boolean(values?.apiKey) &&
  !values?.projectKey &&
  keyProjectId(values?.apiKey, check) === undefined;

export const initialState = {
  values: null as Values | null,
  storedValues: null as Values | null,
  appliedValues: null as Values | null,
  // The user switched editing off in this popup (as opposed to a stored session never applied on this page).
  editingSwitchedOff: false,
  tolgeePresent: 'loading' as TolgeePresent,
  credentialsCheck: null as CredentialsCheck,
  libConfig: null as LibConfig | null,
  error: null as string | null,
  frameId: null as number | null,
  branches: null as BranchOption[] | null,
  declaredProject: null as ProjectOption | null,
  declaredProjectInaccessible: false,
  connectRefusal: null as StoredConnectRefusal | null,
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
  | { type: 'SWITCH_EDITING_OFF' }
  | { type: 'SWITCH_EDITING_ON' }
  | {
      type: 'OAUTH_APPLY';
      payload: { apiUrl: string; projectId: number; projectKey: string };
    }
  | { type: 'SET_BRANCHES'; payload: BranchOption[] | null }
  | {
      type: 'RESOLVE_PROJECT';
      payload: { project: ProjectOption | null; inaccessible: boolean };
    }
  | { type: 'SET_CONNECT_REFUSAL'; payload: StoredConnectRefusal | null };
