/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect } from 'react';
import { getActiveTabOrigin } from './activeTab';
import { loadAppliedValues } from './loadConfig';
import { sendToBackground } from './sendToBackground';
import { loadValues } from './storage';
import { loadConnectRefusal } from '../oauth/connectRefusalStore';
import { deliveryChanged } from './delivery';
import { redeliverToPage, syncToStorageAndPage } from './deliverValues';
import { appliedValuesFrom, validateValues } from './tools';
import { Action, State } from './popupState';

export const useSessionRestore = (
  state: Pick<
    State,
    'libConfig' | 'storedValues' | 'appliedValues' | 'editingSwitchedOff'
  >,
  dispatch: Dispatch<Action>,
  applyRequired: boolean
) => {
  const { libConfig, storedValues, appliedValues, editingSwitchedOff } = state;

  useEffect(() => {
    if (!applyRequired) {
      return;
    }
    // The tab may be mid-reload (no content script to receive) right after connect; a failed delivery is harmless.
    syncToStorageAndPage(
      { storedValues, appliedValues, editingSwitchedOff },
      libConfig
    ).catch(() => undefined);
  }, [storedValues, appliedValues]);

  useEffect(() => {
    if (libConfig) {
      syncPageAppliedValues().catch(() => undefined);
      restoreStoredSession().catch(() => undefined);
      restoreConnectRefusal().catch(() => undefined);
    }
  }, [libConfig]);

  const syncPageAppliedValues = async () => {
    const pageApplied = await loadAppliedValues();
    const applied = appliedValuesFrom(
      pageApplied,
      pageApplied?.session === 'apiKey' ? await loadValues() : null
    );
    if (!validateValues(applied)) {
      return;
    }
    dispatch({ type: 'SET_APPLIED_VALUES', payload: applied });
    if (deliveryChanged(pageApplied, applied, libConfig)) {
      await redeliverToPage(applied, libConfig);
    }
  };

  const restoreConnectRefusal = async () => {
    const refusal = await loadConnectRefusal(await getActiveTabOrigin());
    if (refusal) {
      dispatch({ type: 'SET_CONNECT_REFUSAL', payload: refusal });
    }
  };

  const restoreStoredSession = async () => {
    const storedData = await loadValues();
    if (storedData.oauth && storedData.apiUrl) {
      const res = (await sendToBackground('OAUTH_SESSION_STATE', {
        apiUrl: storedData.apiUrl,
        projectKey: storedData.projectKey,
        pageOrigin: await getActiveTabOrigin(),
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
            siteKey: storedData.siteKey,
          },
        });
      }
    } else if (validateValues(storedData)) {
      dispatch({ type: 'LOAD_STORED_VALUES', payload: storedData });
    }
  };
};
