/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect } from 'react';
import {
  confirmsProjectInaccessible,
  errorCodeOf,
} from '../oauth/sessionRules';
import { declaredProjectId, isOAuth, Values } from './tools';
import { Action, isOAuthUser, ProjectOption, State } from './popupState';
import { credentialFetch } from './proxyFetch';

export const useDeclaredProject = (
  state: Pick<State, 'libConfig' | 'credentialsCheck'>,
  dispatch: Dispatch<Action>,
  checkableValues: Values | null
) => {
  const declaredId = declaredProjectId(state.libConfig);

  useEffect(() => {
    let cancelled = false;
    const isOauthCheck =
      isOAuthUser(state.credentialsCheck) && isOAuth(checkableValues);
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
