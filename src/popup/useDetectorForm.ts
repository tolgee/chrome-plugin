import { useReducer } from 'react';
import { useApplier } from './useApplier';
import { createReducer, initialState } from './reducer';
import { useTolgeeDetection } from './useTolgeeDetection';
import { useSessionRestore } from './useSessionRestore';
import { useCredentialsCheck } from './useCredentialsCheck';
import { useBranchOptions } from './useBranchOptions';
import { useDeclaredProject } from './useDeclaredProject';
import { checkableValuesOf } from './checkableValues';

export const useDetectorForm = () => {
  const { applyRequired, apply } = useApplier();
  const reducer = createReducer(apply);
  const [state, dispatch] = useReducer(reducer, initialState);

  useTolgeeDetection(state.libConfig, dispatch);
  useSessionRestore(state, dispatch, applyRequired);
  const checkableValues = checkableValuesOf(state);
  useCredentialsCheck(checkableValues, state.credentialsCheck, dispatch);
  useBranchOptions(state, dispatch, checkableValues);
  useDeclaredProject(state, dispatch, checkableValues);

  return [state, dispatch] as const;
};
