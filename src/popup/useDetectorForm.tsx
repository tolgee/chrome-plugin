/* eslint-disable react-hooks/exhaustive-deps */
import browser, { type Runtime } from 'webextension-polyfill';
import { useEffect, useReducer } from 'react';
import { LibConfig } from '../types';
import { loadAppliedValues } from './loadConfig';
import { sendMessage } from './sendMessage';
import { sendToBackground } from './sendToBackground';
import { loadValues, storeValues } from './storage';
import {
  compareValues,
  decodeTokenProjectSet,
  isOAuth,
  normalizeUrl,
  validateValues,
  Values,
} from './tools';
import { useApplier } from './useApplier';
import { RuntimeMessage } from '../content/Messages';

type ProjectInfo = {
  projectName: string;
  projectId: number;
  scopes: string[];
  userFullName: string;
  branchingEnabled: boolean;
};

type OAuthUser = {
  oauth: true;
  userFullName: string;
};

type CredentialsCheck = null | 'loading' | 'invalid' | ProjectInfo | OAuthUser;
type TolgeePresent = 'loading' | 'present' | 'not_present' | 'legacy';

type BranchOption = {
  name: string;
  isDefault: boolean;
};

type ProjectOption = {
  id: number;
  name: string;
};

const initialState = {
  values: null as Values | null,
  storedValues: null as Values | null,
  appliedValues: null as Values | null | undefined,
  tolgeePresent: 'loading' as TolgeePresent,
  credentialsCheck: null as CredentialsCheck,
  libConfig: null as LibConfig | null,
  error: null as string | null,
  frameId: null as number | null,
  branches: null as BranchOption[] | null,
  projects: null as ProjectOption[] | null,
};

type State = typeof initialState;
type Action =
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
  | { type: 'SET_PROJECTS'; payload: ProjectOption[] | null };

export const useDetectorForm = () => {
  const { applyRequired, apply } = useApplier();

  const reducer = (state: State, action: Action): State => {
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
        return {
          ...state,
          appliedValues: {
            apiKey: state.values?.apiKey,
            apiUrl: state.values?.apiUrl,
            branch: effectiveBranch,
          },
          storedValues: {
            apiKey: state.values?.apiKey,
            apiUrl: state.values?.apiUrl,
            branch: effectiveBranch,
          },
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
      case 'SET_PROJECTS':
        return {
          ...state,
          projects: action.payload,
        };
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

  const [state, dispatch] = useReducer(reducer, initialState);
  const { storedValues, appliedValues, libConfig } = state;

  useEffect(() => {
    // sync stored values
    if (applyRequired) {
      storeValues(storedValues);
    }
  }, [storedValues]);

  useEffect(() => {
    // sync applied values
    if (applyRequired) {
      sendMessage('SET_CREDENTIALS', { ...appliedValues });
    }
  }, [appliedValues]);

  useEffect(() => {
    sendMessage('DETECT_TOLGEE').catch(() => {
      dispatch({
        type: 'SET_ERROR',
        payload: 'No access to this page, try to refresh',
      });
    });
  }, []);

  // timeout when Tolgee is not detected
  useEffect(() => {
    if (!state.libConfig) {
      const timer = setTimeout(
        () =>
          dispatch({
            type: 'CHANGE_LIB_CONFIG',
            payload: { frameId: null, libData: null },
          }),
        300
      );
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.libConfig]);

  // after tolgee config is loaded
  // get applied values and stored values
  const onLibConfigChange = async () => {
    const appliedValues = await loadAppliedValues();
    if (validateValues(appliedValues)) {
      dispatch({ type: 'SET_APPLIED_VALUES', payload: appliedValues });
    }

    const storedData = await loadValues();
    if (storedData.oauth && storedData.apiUrl) {
      // OAuth sessions store no token; ask the service worker for a fresh (auto-refreshed) one.
      const res = (await sendToBackground('OAUTH_GET_TOKEN', {
        apiUrl: storedData.apiUrl,
      })) as { accessToken?: string };
      if (res?.accessToken) {
        dispatch({
          type: 'LOAD_STORED_VALUES',
          payload: {
            apiUrl: storedData.apiUrl,
            authToken: res.accessToken,
            projectId: storedData.projectId,
          },
        });
      }
    } else if (validateValues(storedData)) {
      dispatch({ type: 'LOAD_STORED_VALUES', payload: storedData });
    }
  };

  useEffect(() => {
    if (state.libConfig) {
      onLibConfigChange();
    }
  }, [state.libConfig]);

  // listen for Tolgee config change
  useEffect(() => {
    const listener = (message: unknown, sender: Runtime.MessageSender) => {
      const { type, data } = message as RuntimeMessage;

      const frameId = sender.frameId;
      if (type === 'TOLGEE_CONFIG_LOADED') {
        dispatch({
          type: 'CHANGE_LIB_CONFIG',
          payload: { libData: data, frameId: frameId || null },
        });
      }

      return undefined;
    };
    browser.runtime.onMessage.addListener(listener);
    () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const setCredentialsCheck = (val: CredentialsCheck) => {
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  let checkableValues: Values | undefined | null;

  // we want to check validity of values, that are displayed and applied
  const valuesToCompare = appliedValues || libConfig?.config;
  if (!storedValues || compareValues(valuesToCompare, storedValues)) {
    checkableValues = validateValues(valuesToCompare);
  }

  // check applied credentials
  useEffect(() => {
    let cancelled = false;
    if (validateValues(checkableValues)) {
      setCredentialsCheck('loading');

      const url = normalizeUrl(checkableValues!.apiUrl);

      if (isOAuth(checkableValues)) {
        // OAuth tokens are not tied to a single project; confirm the token and show the connected user instead.
        fetch(`${url}/v2/user`, {
          headers: { Authorization: `Bearer ${checkableValues!.authToken}` },
        })
          .then((r) => {
            if (r.ok) {
              return r.json();
            }
            throw new Error('Invalid token');
          })
          .then((data) => {
            !cancelled &&
              setCredentialsCheck({ oauth: true, userFullName: data.name });
          })
          .catch(() => {
            !cancelled && setCredentialsCheck('invalid');
          });
      } else {
        fetch(`${url}/v2/api-keys/current?ak=${checkableValues!.apiKey}`)
          .then((r) => {
            if (r.ok) {
              return r.json();
            } else {
              throw r.json();
            }
          })
          .catch(() => {
            !cancelled && setCredentialsCheck('invalid');
          })
          .then((data) => {
            !cancelled &&
              data &&
              setCredentialsCheck({
                projectName: data.projectName,
                projectId: data.projectId,
                scopes: data.scopes,
                userFullName: data.userFullName,
                branchingEnabled: data.branchingEnabled ?? false,
              });
          });
      }
    } else {
      setCredentialsCheck(null);
    }
    return () => {
      cancelled = true;
    };
  }, [
    checkableValues?.apiUrl,
    checkableValues?.apiKey,
    checkableValues?.authToken,
  ]);

  // fetch branches when credentials are valid and branching is enabled
  useEffect(() => {
    let cancelled = false;
    const check = state.credentialsCheck;
    if (
      check !== null &&
      typeof check === 'object' &&
      'branchingEnabled' in check &&
      check.branchingEnabled &&
      validateValues(checkableValues)
    ) {
      const url = normalizeUrl(checkableValues!.apiUrl);
      fetch(
        `${url}/v2/projects/${check.projectId}/branches?ak=${
          checkableValues!.apiKey
        }&size=100`
      )
        .then((r) => {
          if (!r.ok) {
            throw new Error('Failed to load branches');
          }
          return r.json();
        })
        .then((data) => {
          if (!cancelled) {
            dispatch({
              type: 'SET_BRANCHES',
              payload:
                data?._embedded?.branches?.map((b: any) => ({
                  name: b.name,
                  isDefault: b.isDefault,
                })) ?? null,
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            dispatch({ type: 'SET_BRANCHES', payload: null });
          }
        });
    } else {
      dispatch({ type: 'SET_BRANCHES', payload: null });
    }
    return () => {
      cancelled = true;
    };
  }, [state.credentialsCheck]);

  // OAuth tokens carry no project, so once the token is confirmed, load the user's accessible projects to pick from.
  useEffect(() => {
    let cancelled = false;
    const check = state.credentialsCheck;
    if (
      check !== null &&
      typeof check === 'object' &&
      'oauth' in check &&
      isOAuth(checkableValues)
    ) {
      const url = normalizeUrl(checkableValues!.apiUrl);
      fetch(`${url}/v2/projects?size=1000`, {
        headers: { Authorization: `Bearer ${checkableValues!.authToken}` },
      })
        .then((r) => {
          if (!r.ok) {
            throw new Error('Failed to load projects');
          }
          return r.json();
        })
        .then((data) => {
          if (!cancelled) {
            dispatch({
              type: 'SET_PROJECTS',
              payload:
                data?._embedded?.projects?.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                })) ?? [],
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            dispatch({ type: 'SET_PROJECTS', payload: null });
          }
        });
    } else {
      dispatch({ type: 'SET_PROJECTS', payload: null });
    }
    return () => {
      cancelled = true;
    };
  }, [state.credentialsCheck]);

  // A token bound to a single project (chosen on the consent screen) auto-selects it — no popup pick needed. Only the
  // "all projects" case falls back to the dropdown above.
  useEffect(() => {
    const check = state.credentialsCheck;
    if (
      check !== null &&
      typeof check === 'object' &&
      'oauth' in check &&
      isOAuth(checkableValues)
    ) {
      const projectSet = decodeTokenProjectSet(checkableValues!.authToken);
      if (
        Array.isArray(projectSet) &&
        projectSet.length === 1 &&
        state.values?.projectId !== projectSet[0]
      ) {
        dispatch({
          type: 'OAUTH_SET_PROJECT',
          payload: { projectId: projectSet[0] },
        });
      }
    }
  }, [state.credentialsCheck]);

  return [state, dispatch] as const;
};
