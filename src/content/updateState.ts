import { API_KEY_LOCAL_STORAGE, API_URL_LOCAL_STORAGE } from '../constants';
import { Messages } from './Messages';

export const updateState = (config: any, messages: Messages) => {
  const apiKey = sessionStorage.getItem(API_URL_LOCAL_STORAGE);
  const apiUrl = sessionStorage.getItem(API_KEY_LOCAL_STORAGE);

  let state = 'inactive';

  if (Boolean(config) && (apiKey || apiUrl)) {
    state = 'active';
  } else if (Boolean(config)) {
    state = 'present';
  } else {
    state = 'inactive';
  }

  messages.sendToPlugin('TOLGEE_SET_STATE', state);
};
