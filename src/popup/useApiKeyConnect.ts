import { useState, type Dispatch } from 'react';
import { LibConfig } from '../types';
import { projectKeyFor } from '../oauth/sessionRules';
import { useApiKeyCheck } from './useApiKeyCheck';
import { hasSessionOf, siteKeyOf, validateValues, Values } from './tools';
import { Action, isProjectInfo, keyProjectId } from './popupState';

type Args = {
  values: Values | null;
  storedValues: Values | null;
  appliedValues: Values | null;
  libConfig: LibConfig | null;
  onApiKeyTab: boolean;
  dispatch: Dispatch<Action>;
  onUseAnotherKey: () => void;
};

export const useApiKeyConnect = ({
  values,
  storedValues,
  appliedValues,
  libConfig,
  onApiKeyTab,
  dispatch,
  onUseAnotherKey,
}: Args) => {
  const [overridingSiteKey, setOverridingSiteKey] = useState(false);

  const slots = { values, storedValues, appliedValues };
  const hasSession = hasSessionOf(slots);
  const siteKey = siteKeyOf(slots, libConfig);
  const siteKeyScreen = Boolean(siteKey) && !hasSession && !overridingSiteKey;
  const apiKeyCheck = useApiKeyCheck(
    values?.apiUrl,
    values?.apiKey,
    onApiKeyTab && !hasSession && !siteKeyScreen
  );
  const canApplyApiKey =
    Boolean(validateValues(values)) && isProjectInfo(apiKeyCheck);

  const applyApiKey = () => {
    const projectId = keyProjectId(values?.apiKey, apiKeyCheck);
    if (projectId !== undefined) {
      dispatch({
        type: 'CHANGE_VALUES',
        payload: { projectId, projectKey: projectKeyFor(projectId) },
      });
    }
    dispatch({ type: 'APPLY_VALUES' });
  };

  const switchToAnotherKey = () => {
    dispatch({
      type: 'CHANGE_VALUES',
      payload: { apiKey: '', siteKey: values?.apiKey },
    });
    setOverridingSiteKey(true);
    onUseAnotherKey();
  };

  return {
    hasSession,
    siteKey,
    siteKeyScreen,
    apiKeyCheck,
    canApplyApiKey,
    applyApiKey,
    switchToAnotherKey,
    clearOverride: () => setOverridingSiteKey(false),
  };
};
