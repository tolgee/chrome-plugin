import { useEffect, useReducer } from 'react';
import { LibConfig } from '../types';
import { loadAppliedValues } from './loadConfig';
import { sendMessage } from './sendMessage';
import { loadValues, storeValues } from './storage';
import { useApplier } from './useApplier';

type Values = {
  apiUrl?: string;
  apiKey?: string;
};

type ProjectInfo = {
  projectName: string;
  scopes: string[];
  userFullName: string;
};

type CredentialsCheck = null | 'loading' | 'invalid' | ProjectInfo;
type TolgeePresent = 'loading' | 'present' | 'not_present' | 'legacy';

const initialState = {
  values: null as Values | null,
  storedValues: null as Values | null,
  appliedValues: null as Values | null,
  tolgeePresent: 'loading' as TolgeePresent,
  credentialsCheck: null as CredentialsCheck,
  libConfig: null as LibConfig | null,
  error: null as string | null,
  frameId: null as number | null,
};

type State = typeof initialState;
type Action =
  | { type: 'CHANGE_VALUES'; payload: Partial<Values> }
  | {
      type: 'CHANGE_LIB_CONFIG';
      payload: { libData: LibConfig | null; frameId: number | null };
    }
  | { type: 'SET_APPLIED_VALUES'; payload: Values | null }
  | { type: 'SET_CREDENTIALS_CHECK'; payload: CredentialsCheck }
  | { type: 'LOAD_STORED_VALUES'; payload: Values | null }
  | { type: 'APPLY_VALUES' }
  | { type: 'CLEAR_ALL' }
  | { type: 'STORE_VALUES' }
  | { type: 'LOAD_VALUES' };

export const validateValues = (values?: Values | null) => {
  if (values?.apiKey && values?.apiUrl) {
    return values;
  }
  return null;
};

export const useDetectorForm = () => {
  const { applyRequired, apply } = useApplier();

  const reducer = (state: State, action: Action): State => {
    switch (action.type) {
      case 'CHANGE_VALUES':
        return { ...state, values: { ...state.values, ...action.payload } };
      case 'CHANGE_LIB_CONFIG':
        const { libData, frameId } = action.payload;
        const newValues = {
          apiKey: libData?.config?.apiKey,
          apiUrl: libData?.config?.apiUrl,
        };
        if (state.frameId !== null && state.frameId !== frameId) {
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
      case 'APPLY_VALUES':
        // sync values with storage/localStorage
        apply();
        return {
          ...state,
          appliedValues: {
            apiKey: state.values?.apiKey,
            apiUrl: state.values?.apiUrl,
          },
          storedValues: {
            apiKey: state.values?.apiKey,
            apiUrl: state.values?.apiUrl,
          },
        };
      case 'CLEAR_ALL':
        apply();
        return {
          ...state,
          appliedValues: null,
          storedValues: null,
          values: null,
          libConfig: null,
        };
      case 'STORE_VALUES':
        apply();
        return {
          ...state,
          storedValues: state.appliedValues,
          values: state.appliedValues,
          appliedValues: null,
        };
      case 'LOAD_VALUES':
        apply();
        return {
          ...state,
          appliedValues: state.storedValues,
          values: state.storedValues,
        };
      default:
        // @ts-ignore
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
    sendMessage('DETECT_TOLGEE').then(() => {});
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
    if (validateValues(storedData)) {
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
    const listener = ({ type, data }: any, sender) => {
      const frameId = sender.frameId;
      if (type === 'TOLGEE_CONFIG_LOADED') {
        dispatch({
          type: 'CHANGE_LIB_CONFIG',
          payload: { libData: data, frameId },
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const setCredentialsCheck = (val: CredentialsCheck) => {
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  const checkableValues: Values | undefined =
    appliedValues || !storedValues ? libConfig?.config : undefined;

  // check applied credentials
  useEffect(() => {
    if (validateValues(checkableValues)) {
      setCredentialsCheck('loading');

      fetch(
        `${checkableValues!.apiUrl}/v2/api-keys/current?ak=${
          checkableValues!.apiKey
        }`
      )
        .then((r) => r.json())
        .catch(() => setCredentialsCheck('invalid'))
        .then((data) => {
          if (data?.key) {
            setCredentialsCheck({
              projectName: data.projectName,
              scopes: data.scopes,
              userFullName: data.userFullName,
            });
          } else {
            setCredentialsCheck('invalid');
          }
        });
    } else {
      setCredentialsCheck(null);
    }
  }, [checkableValues?.apiUrl, checkableValues?.apiKey]);

  return [state, dispatch] as const;
};
