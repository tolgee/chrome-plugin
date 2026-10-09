import { useState, type Dispatch } from 'react';
import { LibConfig } from '../types';
import { getActiveTab, getActiveTabOrigin } from './activeTab';
import { sendToBackground } from './sendToBackground';
import { Action } from './popupState';
import { projectKeyFor } from '../oauth/sessionRules';
import {
  ConnectRefusal,
  isProjectInaccessibleRefusal,
} from '../oauth/connectRefusal';
import { clearConnectRefusal } from '../oauth/connectRefusalStore';
import {
  dismissMissingPermissions,
  forgetDismissal,
  missingPermissionsToShow,
  reauthorizeThenRecheck,
} from './missingPermissions';

export type ConnectError = ConnectRefusal | { message: string };

type LoginReply = {
  connected?: boolean;
  error?: string;
  code?: string;
  projectId?: number;
  apiUrl?: string;
};

export const useOAuthConnect = (
  dispatch: Dispatch<Action>,
  disconnect: () => Promise<void>,
  libConfig: LibConfig | null
) => {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<ConnectError | null>(null);

  const connect = async (apiUrl: string, projectId: number | undefined) => {
    setConnecting(true);
    setConnectError(null);
    dispatch({ type: 'SET_CONNECT_REFUSAL', payload: null });
    try {
      // See oauth/connectRefusalStore.ts.
      const activeTab = await getActiveTab();
      const res = (await sendToBackground('OAUTH_LOGIN', {
        apiUrl,
        projectId,
        tabId: activeTab?.id,
        protocolVersion: libConfig?.protocolVersion,
      })) as LoginReply;
      if (res?.connected && projectId !== undefined) {
        dispatch({
          type: 'OAUTH_APPLY',
          payload: {
            apiUrl,
            projectId,
            projectKey: projectKeyFor(projectId),
          },
        });
        await forgetDismissal().catch(() => undefined);
        dispatch({
          type: 'SET_MISSING_PERMISSIONS',
          payload: await missingPermissionsToShow(),
        });
      } else if (isProjectInaccessibleRefusal(res)) {
        setConnectError({
          code: res.code,
          projectId: res.projectId,
          apiUrl: res.apiUrl,
        });
      } else {
        setConnectError({ message: res?.error || 'Connection failed' });
      }
    } finally {
      setConnecting(false);
    }
  };

  const signInAgain = async (apiUrl: string, projectId: number | undefined) => {
    await disconnect();
    await connect(apiUrl, projectId);
  };

  const reauthorize = async () => {
    setConnecting(true);
    try {
      dispatch({
        type: 'SET_MISSING_PERMISSIONS',
        payload: await reauthorizeThenRecheck(),
      });
    } finally {
      setConnecting(false);
    }
  };

  const dismissMissing = async (missing: string[]) => {
    dispatch({ type: 'SET_MISSING_PERMISSIONS', payload: [] });
    await dismissMissingPermissions(missing).catch(() => undefined);
  };

  const dismissRefusal = async () => {
    setConnectError(null);
    dispatch({ type: 'SET_CONNECT_REFUSAL', payload: null });
    const origin = await getActiveTabOrigin();
    if (origin) {
      await clearConnectRefusal(origin).catch(() => undefined);
    }
  };

  return {
    connect,
    signInAgain,
    reauthorize,
    dismissMissing,
    connecting,
    connectError,
    dismissRefusal,
  };
};
