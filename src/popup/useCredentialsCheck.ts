/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect } from 'react';
import {
  confirmsProjectInaccessible,
  errorCodeOf,
} from '../oauth/sessionRules';
import {
  compareValues,
  declaredProjectId,
  isOAuth,
  validateValues,
  Values,
} from './tools';
import {
  Action,
  branchableProjectId,
  CredentialsCheck,
  isOAuthUser,
  ProjectOption,
  State,
} from './popupState';
import { fetchBranches } from './branch';
import { credentialFetch, isInconclusiveSessionCheckError } from './proxyFetch';
import { checkApiKey, checkOAuthSession } from './credentialsCheck';

export const useCredentialsCheck = (
  state: Pick<
    State,
    | 'libConfig'
    | 'storedValues'
    | 'appliedValues'
    | 'credentialsCheck'
    | 'declaredProject'
  >,
  dispatch: Dispatch<Action>
) => {
  const { libConfig, storedValues, appliedValues } = state;

  const setCredentialsCheck = (val: CredentialsCheck) => {
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  const valuesToCompare =
    appliedValues || storedValues || (libConfig?.config as Values);
  const checkableValues =
    !storedValues || compareValues(valuesToCompare, storedValues)
      ? validateValues(valuesToCompare)
      : null;

  useEffect(() => {
    let cancelled = false;
    if (!checkableValues) {
      setCredentialsCheck(null);
      return undefined;
    }
    setCredentialsCheck('loading');
    const check = isOAuth(checkableValues)
      ? checkOAuthSession(checkableValues)
      : checkApiKey(checkableValues);
    check
      .then((result) => {
        !cancelled && setCredentialsCheck(result);
      })
      .catch((e) => {
        if (cancelled || isInconclusiveSessionCheckError(e)) {
          return;
        }
        setCredentialsCheck('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [
    checkableValues?.apiUrl,
    checkableValues?.apiKey,
    checkableValues?.oauth,
  ]);

  useEffect(() => {
    let cancelled = false;
    const projectId = branchableProjectId(
      state.credentialsCheck,
      state.declaredProject
    );
    if (projectId === null || !checkableValues) {
      dispatch({ type: 'SET_BRANCHES', payload: null });
      return undefined;
    }
    fetchBranches(projectId, checkableValues)
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
    if (!isOauthCheck || !checkableValues || declaredId === undefined) {
      dispatch({
        type: 'RESOLVE_PROJECT',
        payload: { project: null, inaccessible: false },
      });
      return;
    }
    resolveDeclaredProject(checkableValues, declaredId).then((payload) => {
      if (!cancelled) {
        dispatch({ type: 'RESOLVE_PROJECT', payload });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.credentialsCheck, declaredId]);
};

const resolveDeclaredProject = async (
  values: Values,
  declaredId: number
): Promise<{ project: ProjectOption | null; inaccessible: boolean }> => {
  try {
    const r = await credentialFetch(values, `/v2/projects/${declaredId}`);
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
      inaccessible: confirmsProjectInaccessible(r.status, await errorCodeOf(r)),
    };
  } catch {
    return { project: null, inaccessible: false };
  }
};
