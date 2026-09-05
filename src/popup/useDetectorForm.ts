import { useReducer } from 'react';
import { useApplier } from './useApplier';
import { createReducer, initialState } from './reducer';
import { useTolgeeDetection } from './useTolgeeDetection';
import { useSessionRestore } from './useSessionRestore';
import { useCredentialsCheck } from './useCredentialsCheck';

export const useDetectorForm = () => {
  const { applyRequired, apply } = useApplier();
  const reducer = createReducer(apply);
  const [state, dispatch] = useReducer(reducer, initialState);

  useTolgeeDetection(state.libConfig, dispatch);
  useSessionRestore(state, dispatch, applyRequired);
  useCredentialsCheck(state, dispatch);

  return [state, dispatch] as const;
};
