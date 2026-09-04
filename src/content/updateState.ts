import { API_KEY_SESSION_STORAGE, API_URL_SESSION_STORAGE } from '../constants';
import { Messages } from './Messages';

export const updateState = (config: any, messages: Messages) => {
  const apiKey = sessionStorage.getItem(API_KEY_SESSION_STORAGE);
  const apiUrl = sessionStorage.getItem(API_URL_SESSION_STORAGE);

  const state = config ? (apiKey || apiUrl ? 'active' : 'present') : 'inactive';

  messages.sendToPlugin('TOLGEE_SET_STATE', state);
};
