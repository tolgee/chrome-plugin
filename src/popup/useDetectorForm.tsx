/* eslint-disable react-hooks/exhaustive-deps */
import browser, { type Runtime } from 'webextension-polyfill';
import { useEffect, useReducer } from 'react';
import { getActiveTab } from './activeTab';
import { loadAppliedValues } from './loadConfig';
import { sendMessage } from './sendMessage';
import { sendToBackground } from './sendToBackground';
import { loadValues, storeValues } from './storage';
import { safeOrigin } from '../oauth/url';
import {
  compareValues,
  declaredProjectId,
  isOAuth,
  normalizeUrl,
  validateValues,
  Values,
} from './tools';
import { useApplier } from './useApplier';
import { RuntimeMessage } from '../content/Messages';
import {
  CredentialsCheck,
  createReducer,
  initialState,
  isOAuthUser,
  isProjectInfo,
} from './reducer';

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
      // Stamp the connected page's origin so the content script delivers only to that frame, not a cross-origin iframe.
      getActiveTab()
        .then((tab) =>
          sendMessage('SET_CREDENTIALS', {
            ...appliedValues,
            pageOrigin: safeOrigin(tab?.url),
          })
        )
        // The tab may be mid-reload (no content script to receive) right after connect; a failed delivery is harmless.
        .catch(() => undefined);
    }
  }, [appliedValues]);

  useEffect(() => {
    let cancelled = false;
    // Applying/un-applying reloads the page, so the content script is briefly gone. Retry before declaring the page
    // inaccessible, otherwise opening the popup mid-reload sticks on the error screen with no recovery.
    const detect = (attemptsLeft: number) => {
      sendMessage('DETECT_TOLGEE').catch(() => {
        if (cancelled) {
          return;
        }
        if (attemptsLeft > 0) {
          setTimeout(() => detect(attemptsLeft - 1), 250);
          return;
        }
        dispatch({
          type: 'SET_ERROR',
          payload: 'No access to this page, try to refresh',
        });
      });
    };
    detect(16);
    return () => {
      cancelled = true;
    };
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
    const pageApplied = await loadAppliedValues();
    if (validateValues(pageApplied)) {
      dispatch({ type: 'SET_APPLIED_VALUES', payload: pageApplied });
    }

    const storedData = await loadValues();
    if (storedData.oauth && storedData.apiUrl) {
      // OAuth sessions store no token; ask the service worker for a fresh (auto-refreshed) one for this project.
      const res = (await sendToBackground('OAUTH_GET_TOKEN', {
        apiUrl: storedData.apiUrl,
        projectId: storedData.projectId,
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
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const setCredentialsCheck = (val: CredentialsCheck) => {
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  let checkableValues: Values | undefined | null;

  // we want to check validity of values, that are displayed and applied
  // Fall back to the stored session (not just the page's SDK config) so a connected session stays recognized while the
  // Applied toggle is off — the page config carries no OAuth token, which would otherwise blank the connected state.
  const valuesToCompare =
    appliedValues || storedValues || (libConfig?.config as Values);
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
      isProjectInfo(check) &&
      check.branchingEnabled &&
      validateValues(checkableValues)
    ) {
      const url = normalizeUrl(checkableValues!.apiUrl);
      fetch(`${url}/v2/projects/${check.projectId}/branches?size=100`, {
        headers: { 'X-API-Key': checkableValues!.apiKey! },
      })
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

  // Bind the page's declared project to the OAuth token by resolving it against the connected server, or flag it
  // inaccessible — else the token stays unscoped and in-context editing fails with "project not selected".
  const declaredId = declaredProjectId(libConfig);
  useEffect(() => {
    let cancelled = false;
    const check = state.credentialsCheck;
    const isOauthCheck = isOAuthUser(check) && isOAuth(checkableValues);
    if (!isOauthCheck || declaredId === undefined) {
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
  }, [state.credentialsCheck, declaredId]);

  return [state, dispatch] as const;
};
