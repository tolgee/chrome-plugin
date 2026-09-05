/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect } from 'react';
import { isOAuth, Values } from './tools';
import { Action, CredentialsCheck } from './popupState';
import { isInconclusiveSessionCheckError } from './proxyFetch';
import { checkApiKey, checkOAuthSession } from './credentialsCheck';

// A 5xx/network/timeout/unavailable answer is inconclusive, not a rejection: it leaves whatever credentialsCheck
// already held alone rather than flipping a connected session to 'invalid' on a transient server outage.
export const runCredentialsCheck = async (
  checkableValues: Values,
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
      return;
    }
    setCredentialsCheck('invalid');
  }
};

export const useCredentialsCheck = (
  checkableValues: Values | null,
  dispatch: Dispatch<Action>
) => {
  const setCredentialsCheck = (val: CredentialsCheck) => {
    dispatch({ type: 'SET_CREDENTIALS_CHECK', payload: val });
  };

  useEffect(() => {
    let cancelled = false;
    if (!checkableValues) {
      setCredentialsCheck(null);
      return undefined;
    }
    runCredentialsCheck(checkableValues, (val) => {
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
