import { API_URL_SESSION_STORAGE } from '../sessionStorageKeys';
import { LibConfig } from '../types';
import { Messages } from './Messages';

export const updateState = (
  config: LibConfig | undefined,
  messages: Messages
) => {
  const apiUrl = sessionStorage.getItem(API_URL_SESSION_STORAGE);

  const state = config ? (apiUrl ? 'active' : 'present') : 'inactive';

  messages.sendToPlugin('TOLGEE_SET_STATE', state);
};
