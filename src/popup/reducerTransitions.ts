import { LibConfig } from '../types';
import { projectKeyFor } from '../oauth/sessionRules';
import { validateValues } from './tools';
import { branchableProjectId, ProjectOption, State } from './popupState';
import {
  isSecondTolgeeInstance,
  pageValues,
  withKeyProject,
} from './transitionValues';

/** `applied` is false when the transition changed nothing that has to reach storage and the page. */
export type Transition = { state: State; applied: boolean };

export const changeLibConfig = (
  state: State,
  libData: LibConfig | null,
  frameId: number | null
): State => {
  const newValues = pageValues(libData);
  if (isSecondTolgeeInstance(state, libData, frameId)) {
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
};

export const applyValues = (state: State): Transition => {
  const pinned = withKeyProject(state.values, state.credentialsCheck);
  if (!pinned) {
    return { state, applied: false };
  }
  const branchEnabled =
    branchableProjectId(state.credentialsCheck, state.declaredProject) !== null;
  const nextValues = {
    apiKey: pinned.apiKey,
    apiUrl: pinned.apiUrl,
    branch: branchEnabled ? state.values?.branch : undefined,
    oauth: pinned.oauth,
    projectId: pinned.projectId,
    projectKey: pinned.projectKey,
    siteKey: pinned.siteKey,
  };
  return {
    state: {
      ...state,
      appliedValues: nextValues,
      storedValues: nextValues,
      editingSwitchedOff: false,
    },
    applied: true,
  };
};

export const clearAll = (state: State): State => {
  const removedKey = state.appliedValues?.apiKey || state.storedValues?.apiKey;
  const page = pageValues(state.libConfig);
  // Until the page reloads, its last handshake still reports the key the extension injected as its own.
  const pageKey = page.apiKey === removedKey ? '' : page.apiKey;
  return {
    ...state,
    appliedValues: null,
    storedValues: null,
    editingSwitchedOff: false,
    values: { ...page, apiKey: state.storedValues?.siteKey ?? pageKey },
    declaredProject: null,
    declaredProjectInaccessible: false,
  };
};

export const oauthApply = (
  state: State,
  payload: { apiUrl: string; projectId: number; projectKey: string }
): State => {
  const oauthValues = {
    apiUrl: payload.apiUrl,
    oauth: true,
    projectId: payload.projectId,
    projectKey: payload.projectKey,
    siteKey: state.values?.siteKey ?? state.storedValues?.siteKey,
  };
  return {
    ...state,
    values: oauthValues,
    appliedValues: oauthValues,
    storedValues: oauthValues,
    editingSwitchedOff: false,
    declaredProject: null,
    declaredProjectInaccessible: false,
    connectRefusal: null,
  };
};

export const resolveProject = (
  state: State,
  payload: { project: ProjectOption | null; inaccessible: boolean }
): Transition => {
  const { project, inaccessible } = payload;
  // The check that decided to resolve a project ran against checkableValues (see useDeclaredProject.ts), which can
  // differ from state.values by the time this dispatches; require an actual OAuth session here too, or a page-config
  // fallback with no projectKey would otherwise pass the projectKey-mismatch check below and get a project bound in.
  const isOAuthSession = Boolean(state.values?.oauth);
  const outsideSession =
    project !== null &&
    state.values?.projectKey !== undefined &&
    projectKeyFor(project.id) !== state.values.projectKey;
  if (!project || !isOAuthSession || outsideSession) {
    return {
      state: {
        ...state,
        declaredProject: null,
        declaredProjectInaccessible:
          isOAuthSession && (inaccessible || outsideSession),
      },
      applied: false,
    };
  }
  const oauthValues = { ...state.values, projectId: project.id };
  // Never re-apply a session the user switched off: doing so would fight the Applied toggle and flicker the popup.
  const isApplied = state.appliedValues != null;
  return {
    state: {
      ...state,
      declaredProject: project,
      declaredProjectInaccessible: false,
      values: oauthValues,
      appliedValues: isApplied ? oauthValues : state.appliedValues,
      storedValues: oauthValues,
    },
    applied: true,
  };
};

export const switchEditingOff = (state: State): State => {
  // The page's own copy of the applied values (sessionStorage) carries no siteKey; only the stored record does.
  const stored = state.appliedValues
    ? {
        ...state.appliedValues,
        siteKey: state.appliedValues.siteKey ?? state.storedValues?.siteKey,
      }
    : null;
  return {
    ...state,
    storedValues: stored,
    values: stored,
    appliedValues: null,
    editingSwitchedOff: true,
  };
};

export const switchEditingOn = (state: State): Transition => {
  const stored = withKeyProject(state.storedValues, state.credentialsCheck);
  if (!stored) {
    return { state, applied: false };
  }
  return {
    state: {
      ...state,
      appliedValues: stored,
      storedValues: stored,
      values: stored,
      editingSwitchedOff: false,
    },
    applied: true,
  };
};
