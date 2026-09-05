/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect, useRef } from 'react';
import { isOAuth, Values } from './tools';
import { Action, CredentialsCheck } from './popupState';
import { isInconclusiveSessionCheckError } from './proxyFetch';
import { checkApiKey, checkOAuthSession } from './credentialsCheck';

// A 5xx/network/timeout/unavailable answer is inconclusive, not a rejection: it restores `previous` rather than
// flipping a connected session to 'invalid' on a transient server outage. `previous` must never itself be 'loading'
// (see useCredentialsCheck's lastResult ref) or an inconclusive answer would strand the panel there permanently.
export const runCredentialsCheck = async (
  checkableValues: Values,
  previous: CredentialsCheck,
  setCredentialsCheck: (val: CredentialsCheck) => void
): Promise<void> => {
  setCredentialsCheck('loading');
  const check = isOAuth(checkableValues)
    ? checkOAuthSession(checkableValues)
    : checkApiKey(checkableValues);
  try {
    setCredentialsCheck(await check);
  } catch (e) {
    if (isInconclusiveSessionCheckError(e)) {
      setCredentialsCheck(previous);
      return;
    }
    setCredentialsCheck('invalid');
  }
};

export const useCredentialsCheck = (
  checkableValues: Values | null,
  dispatch: Dispatch<Action>
) => {
  // The last non-'loading' verdict a check actually settled on, read fresh at the moment an inconclusive answer
  // needs something to restore. A prop/state value read from the render the effect started on can itself be
  // 'loading' if a second check starts before the first settles; this ref never holds that value.
  const lastResult = useRef<CredentialsCheck>(null);

  const setCredentialsCheck = (val: CredentialsCheck) => {
    if (val !== 'loading') {
      lastResult.current = val;
    }
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  useEffect(() => {
    let cancelled = false;
    if (!checkableValues) {
      lastResult.current = null;
      setCredentialsCheck(null);
      return undefined;
    }
    runCredentialsCheck(checkableValues, lastResult.current, (val) => {
      if (!cancelled) {
        setCredentialsCheck(val);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    checkableValues?.apiUrl,
    checkableValues?.apiKey,
    checkableValues?.oauth,
  ]);
};
