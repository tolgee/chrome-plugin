/* eslint-disable react-hooks/exhaustive-deps */
import browser, { type Runtime } from 'webextension-polyfill';
import { useEffect, useReducer } from 'react';
import { loadAppliedValues } from './loadConfig';
import { sendMessage } from './sendMessage';
import { sendToBackground } from './sendToBackground';
import { loadValues, storeValues } from './storage';
import {
  compareValues,
  isOAuth,
  normalizeUrl,
  validateValues,
  Values,
} from './tools';
import { useApplier } from './useApplier';
import { RuntimeMessage } from '../content/Messages';
import { CredentialsCheck, createReducer, initialState } from './reducer';

export const useDetectorForm = () => {
  const { applyRequired, apply } = useApplier();

  const reducer = createReducer(apply);

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
        // Send the key in the header, not the query string, so it can't leak via URLs/history/logs.
        fetch(`${url}/v2/api-keys/current`, {
          headers: { 'X-API-Key': checkableValues!.apiKey! },
        })
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

  // The page declares which project it edits (required by the extension), but an OAuth token isn't inherently bound to
  // it. Resolve that declared id against the connected server: bind it when the user can edit it there, or flag it
  // inaccessible — otherwise the token stays unscoped and in-context editing fails with "project not selected".
  useEffect(() => {
    let cancelled = false;
    const check = state.credentialsCheck;
    const isOauthCheck =
      check !== null &&
      typeof check === 'object' &&
      'oauth' in check &&
      isOAuth(checkableValues);
    const declaredId = Number(
      (libConfig?.config as { projectId?: number | string } | undefined)
        ?.projectId
    );
    if (!isOauthCheck || !declaredId) {
      dispatch({
        type: 'RESOLVE_PROJECT',
        payload: { project: null, inaccessible: false },
      });
      return;
    }
    const url = normalizeUrl(checkableValues!.apiUrl);
    fetch(`${url}/v2/projects/${declaredId}`, {
      headers: { Authorization: `Bearer ${checkableValues!.authToken}` },
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error('inaccessible');
        }
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          dispatch({
            type: 'RESOLVE_PROJECT',
            payload: {
              project: { id: data.id, name: data.name },
              inaccessible: false,
            },
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({
            type: 'RESOLVE_PROJECT',
            payload: { project: null, inaccessible: true },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.credentialsCheck]);

  return [state, dispatch] as const;
};
