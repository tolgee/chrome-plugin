/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect } from 'react';
import { Values } from './tools';
import { Action, branchableProjectId, State } from './popupState';
import { fetchBranches } from './branch';

export const useBranchOptions = (
  state: Pick<State, 'credentialsCheck' | 'declaredProject'>,
  dispatch: Dispatch<Action>,
  checkableValues: Values | null
) => {
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
};
