import { Action, initialState, State } from './popupState';
import {
  applyValues,
  changeLibConfig,
  clearAll,
  oauthApply,
  resolveProject,
  switchEditingOff,
  switchEditingOn,
  Transition,
} from './reducerTransitions';

export { initialState };

// `apply` is useApplier's apply: it flips a ref and forces a render, and the real storage/page write runs
// afterwards in useSessionRestore's effect, against the next state - not synchronously here.
export const createReducer =
  (apply: () => void) =>
  (state: State, action: Action): State => {
    const synced = (transition: Transition): State => {
      if (transition.applied) {
        apply();
      }
      return transition.state;
    };
    switch (action.type) {
      case 'CHANGE_VALUES':
        return { ...state, values: { ...state.values, ...action.payload } };
      case 'CHANGE_LIB_CONFIG':
        return changeLibConfig(
          state,
          action.payload.libData,
          action.payload.frameId
        );
      case 'SET_ERROR':
        return {
          ...state,
          tolgeePresent: 'not_present',
          error: action.payload,
        };
      case 'SET_APPLIED_VALUES':
        return { ...state, appliedValues: action.payload };
      case 'SET_CREDENTIALS_CHECK':
        return { ...state, credentialsCheck: action.payload };
      case 'LOAD_STORED_VALUES':
        return {
          ...state,
          storedValues: action.payload,
          values: action.payload,
        };
      case 'APPLY_VALUES':
        return synced(applyValues(state));
      case 'CLEAR_ALL':
        apply();
        return clearAll(state);
      case 'OAUTH_APPLY':
        apply();
        return oauthApply(state, action.payload);
      case 'RESOLVE_PROJECT':
        return synced(resolveProject(state, action.payload));
      case 'SWITCH_EDITING_OFF':
        apply();
        return switchEditingOff(state);
      case 'SWITCH_EDITING_ON':
        return synced(switchEditingOn(state));
      case 'SET_CONNECT_REFUSAL':
        return { ...state, connectRefusal: action.payload };
      case 'SET_BRANCHES':
        return { ...state, branches: action.payload };
      default:
        // @ts-expect-error action type is unknown
        throw new Error(`Unknown action ${action.type}`);
    }
  };
