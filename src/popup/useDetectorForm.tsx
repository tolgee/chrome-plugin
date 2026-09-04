/* eslint-disable react-hooks/exhaustive-deps */
import browser, { type Runtime } from 'webextension-polyfill';
import { useEffect, useReducer } from 'react';
import { getActiveTab } from './activeTab';
import { loadAppliedValues } from './loadConfig';
import { sendMessage } from './sendMessage';
import { sendToBackground } from './sendToBackground';
import { loadValues, storeValues } from './storage';
import { normalizeUrl, safeOrigin } from '../oauth/url';
import { confirmsProjectInaccessible } from '../oauth/sessionRules';
import {
  compareValues,
  declaredProjectId,
  isOAuth,
  validateValues,
  Values,
} from './tools';
import { useApplier } from './useApplier';
import { RuntimeMessage } from '../content/Messages';
import {
  branchableProjectId,
  CredentialsCheck,
  createReducer,
  initialState,
  isOAuthUser,
  ProjectOption,
} from './reducer';
import { credentialFetch, fetchBranches } from './branch';
import { ProxyTarget } from './proxyFetch';

const DETECT_TIMEOUT_MS = 15_000;
const DETECT_INITIAL_DELAY_MS = 250;
const DETECT_MAX_DELAY_MS = 1_500;

const proxyTargetFor = async (values: Values): Promise<ProxyTarget> => ({
  pageOrigin: safeOrigin((await getActiveTab())?.url),
  apiUrl: values.apiUrl,
  projectKey: values.projectKey,
});

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
      // Stamp the origin the content script's acceptsCredentialDelivery checks it against.
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
    // Applying/un-applying reloads the page, so the content script is briefly gone. A dev-server page (vite) can
    // take well over 4 s to get it back, so keep asking for a while before giving up.
    const detect = (waitedMs: number, delayMs: number) => {
      sendMessage('DETECT_TOLGEE').catch(() => {
        if (cancelled) {
          return;
        }
        if (waitedMs < DETECT_TIMEOUT_MS) {
          setTimeout(
            () =>
              detect(
                waitedMs + delayMs,
                Math.min(delayMs * 1.5, DETECT_MAX_DELAY_MS)
              ),
            delayMs
          );
          return;
        }
        dispatch({
          type: 'SET_ERROR',
          payload: 'No access to this page, try to refresh',
        });
      });
    };
    detect(0, DETECT_INITIAL_DELAY_MS);
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
  const syncPageAppliedValues = async () => {
    const pageApplied = await loadAppliedValues();
    if (validateValues(pageApplied)) {
      dispatch({ type: 'SET_APPLIED_VALUES', payload: pageApplied });
    }
  };

  const restoreStoredSession = async () => {
    const storedData = await loadValues();
    if (storedData.oauth && storedData.apiUrl) {
      const activeTab = await getActiveTab();
      const res = (await sendToBackground('OAUTH_SESSION_STATE', {
        apiUrl: storedData.apiUrl,
        projectKey: storedData.projectKey,
        pageOrigin: safeOrigin(activeTab?.url),
      })) as { active?: boolean };
      if (res?.active) {
        dispatch({
          type: 'LOAD_STORED_VALUES',
          payload: {
            apiUrl: storedData.apiUrl,
            oauth: true,
            projectId: storedData.projectId,
            projectKey: storedData.projectKey,
            branch: storedData.branch,
          },
        });
      }
    } else if (validateValues(storedData)) {
      dispatch({ type: 'LOAD_STORED_VALUES', payload: storedData });
    }
  };

  useEffect(() => {
    if (state.libConfig) {
      syncPageAppliedValues();
      restoreStoredSession();
    }
  }, [state.libConfig]);

  // listen for Tolgee config change
  useEffect(() => {
    let cancelled = false;
    let activeTabId: number | undefined;
    // Content scripts broadcast with runtime.sendMessage, so every tab's handshake lands here; only the tab the
    // popup was opened on may drive its state.
    getActiveTab().then((tab) => {
      activeTabId = tab?.id;
    });
    const listener = (message: unknown, sender: Runtime.MessageSender) => {
      const { type, data } = message as RuntimeMessage;
      if (cancelled || type !== 'TOLGEE_CONFIG_LOADED') {
        return undefined;
      }
      if (activeTabId === undefined || sender.tab?.id !== activeTabId) {
        return undefined;
      }
      dispatch({
        type: 'CHANGE_LIB_CONFIG',
        payload: { libData: data, frameId: sender.frameId ?? null },
      });
      return undefined;
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const setCredentialsCheck = (val: CredentialsCheck) => {
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  let checkableValues: Values | undefined | null;

  // we want to check validity of values, that are displayed and applied
  // Falls back to storedValues, not just the page's SDK config, which carries no OAuth session on its own.
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
        // The session is opaque to the popup, so the connected user is the only thing this check can confirm; project
        // reachability is probed separately below (RESOLVE_PROJECT).
        proxyTargetFor(checkableValues!)
          .then((target) =>
            credentialFetch(checkableValues!, '/v2/user', target)
          )
          .then((r) => {
            if (r.ok) {
              return r.json();
            }
            throw new Error('Invalid session');
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
            if (!r.ok) {
              throw new Error('Invalid API key');
            }
            return r.json();
          })
          .then((data) => {
            !cancelled &&
              setCredentialsCheck({
                projectName: data.projectName,
                projectId: data.projectId,
                scopes: data.scopes,
                userFullName: data.userFullName,
                branchingEnabled: data.branchingEnabled ?? false,
              });
          })
          .catch(() => {
            !cancelled && setCredentialsCheck('invalid');
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
    checkableValues?.oauth,
  ]);

  // fetch branches when credentials are valid and branching is enabled
  useEffect(() => {
    let cancelled = false;
    const projectId = branchableProjectId(
      state.credentialsCheck,
      state.declaredProject
    );
    if (projectId === null || !validateValues(checkableValues)) {
      dispatch({ type: 'SET_BRANCHES', payload: null });
      return undefined;
    }
    proxyTargetFor(checkableValues!)
      .then((target) => fetchBranches(projectId, checkableValues!, target))
      // A server that refuses to list branches (feature not licensed) has nothing to switch between.
      .catch(() => [])
      .then((branches) => {
        if (!cancelled) {
          dispatch({ type: 'SET_BRANCHES', payload: branches });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.credentialsCheck, state.declaredProject]);

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
    const resolveDeclaredProject = async (): Promise<{
      project: ProjectOption | null;
      inaccessible: boolean;
    }> => {
      try {
        const target = await proxyTargetFor(checkableValues!);
        const r = await credentialFetch(
          checkableValues!,
          `/v2/projects/${declaredId}`,
          target
        );
        if (r.ok) {
          const data = await r.json();
          return {
            project: {
              id: data.id,
              name: data.name,
              branchingEnabled: Boolean(data.useBranching),
            },
            inaccessible: false,
          };
        }
        return {
          project: null,
          inaccessible: confirmsProjectInaccessible(r.status),
        };
      } catch {
        return { project: null, inaccessible: false };
      }
    };
    resolveDeclaredProject().then((payload) => {
      if (!cancelled) {
        dispatch({ type: 'RESOLVE_PROJECT', payload });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.credentialsCheck, declaredId]);

  return [state, dispatch] as const;
};
