/* eslint-disable react-hooks/exhaustive-deps */
import { Dispatch, useEffect } from 'react';
import { getActiveTabOrigin } from './activeTab';
import { loadAppliedValues } from './loadConfig';
import { sendToBackground } from './sendToBackground';
import { loadValues, storeValues } from './storage';
import { loadConnectRefusal } from '../oauth/connectRefusalStore';
import { resolveAppliedValues } from './delivery';
import { redeliverToPage, syncToStorageAndPage } from './deliverValues';
import { isConnectedSession, migrateLegacyApiKeyRecord } from './tools';
import { Action, State } from './popupState';
import { missingPermissionsToShow } from './missingPermissions';
import { oauthSessionLocator } from './sessionLocator';

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
      checkMissingPermissions().catch(() => undefined);
      restoreConnectRefusal().catch(() => undefined);
    }
  }, [libConfig]);

  const syncPageAppliedValues = async () => {
    const pageApplied = await loadAppliedValues();
    const resolved = resolveAppliedValues(
      pageApplied,
      pageApplied?.session === 'apiKey' ? await loadValues() : null,
      libConfig
    );
    if (!resolved) {
      return;
    }
    dispatch({ type: 'SET_APPLIED_VALUES', payload: resolved.applied });
    if (resolved.redeliver) {
      await redeliverToPage(resolved.applied, libConfig);
    }
  };

  const restoreConnectRefusal = async () => {
    const refusal = await loadConnectRefusal(await getActiveTabOrigin());
    if (refusal) {
      dispatch({ type: 'SET_CONNECT_REFUSAL', payload: refusal });
    }
  };

  const checkMissingPermissions = async () =>
    dispatch({
      type: 'SET_MISSING_PERMISSIONS',
      payload: await missingPermissionsToShow(),
    });

  const restoreStoredSession = async () => {
    const storedData = await loadValues();
    const locator = await oauthSessionLocator(storedData);
    if (locator) {
      const res = (await sendToBackground('OAUTH_SESSION_STATE', locator)) as {
        active?: boolean;
      };
      if (res?.active) {
        dispatch({
          type: 'LOAD_STORED_VALUES',
          payload: {
            apiUrl: locator.apiUrl,
            oauth: true,
            projectId: storedData.projectId,
            projectKey: storedData.projectKey,
            branch: storedData.branch,
            siteKey: storedData.siteKey,
          },
        });
      }
    } else if (isConnectedSession(storedData)) {
      dispatch({ type: 'LOAD_STORED_VALUES', payload: storedData });
    } else {
      const migrated = migrateLegacyApiKeyRecord(storedData);
      if (migrated) {
        await storeValues(migrated);
        dispatch({ type: 'LOAD_STORED_VALUES', payload: migrated });
      }
    }
  };
};
