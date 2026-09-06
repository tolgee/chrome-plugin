import type { Dispatch } from 'react';
import { getActiveTabOrigin } from './activeTab';
import { sendToBackground } from './sendToBackground';
import { Action } from './popupState';

export const useDisconnect = (
  dispatch: Dispatch<Action>,
  isOauthSession: boolean,
  onCleared: () => void
) => {
  const disconnect = async () => {
    try {
      if (isOauthSession) {
        await sendToBackground('OAUTH_LOGOUT', {
          pageOrigin: await getActiveTabOrigin(),
        });
      }
    } finally {
      onCleared();
      dispatch({ type: 'CLEAR_ALL' });
    }
  };
  return { disconnect };
};
