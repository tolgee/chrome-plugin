import { useEffect, useReducer } from 'react';
import { loadAppliedValues, loadConfig } from './loadConfig';
import { sendMessage } from './sendMessage';
import { loadValues, storeValues } from './storage';
import { useApplier } from './useApplier';

type Values = {
  apiUrl?: string;
  apiKey?: string;
};

type LibConfig = {
  uiPresent: boolean;
  config: {
    apiUrl: '';
    apiKey: '';
    mode: 'production' | 'development';
  };
};

type CredentialsCheck = null | 'loading' | 'invalid' | 'valid';
type TolgeePresent = 'loading' | 'present' | 'not_present' | 'legacy';

const initialState = {
  values: null as Values | null,
  storedValues: null as Values | null,
  appliedValues: null as Values | null,
  tolgeePresent: 'loading' as TolgeePresent,
  credentialsCheck: null as CredentialsCheck,
  libConfig: null as LibConfig | null,
};

type State = typeof initialState;
type Action =
  | { type: 'CHANGE_VALUES'; payload: Partial<Values> }
  | { type: 'CHANGE_LIB_CONFIG'; payload: LibConfig | null }
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
        const newValues = {
          apiKey: action.payload?.config?.apiKey,
          apiUrl: action.payload?.config?.apiUrl,
        };
        return {
          ...state,
          libConfig: action.payload,
          values: validateValues(state.values) || newValues,
          tolgeePresent: !action.payload
            ? 'not_present'
            : action.payload.uiPresent === undefined
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
          appliedValues: undefined,
          storedValues: undefined,
          values: undefined,
          libConfig: undefined,
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
    loadConfig()
      .then((libConfig) => {
        dispatch({ type: 'CHANGE_LIB_CONFIG', payload: libConfig });
      })
      .catch(() => {
        dispatch({ type: 'CHANGE_LIB_CONFIG', payload: null });
      });
  }, []);

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

  // listen for Tolgee config change (after page is reloaded)
  useEffect(() => {
    const listener = ({ type, data }: any) => {
      if (type === 'TOLGEE_CONFIG_LOADED') {
        dispatch({
          type: 'CHANGE_LIB_CONFIG',
          payload: data,
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
    appliedValues || libConfig?.config;

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
            setCredentialsCheck('valid');
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
