import {
  API_KEY_LOCAL_STORAGE,
  API_URL_LOCAL_STORAGE,
  AUTH_TOKEN_LOCAL_STORAGE,
  BRANCH_LOCAL_STORAGE,
} from '../constants';
import { LibConfig } from '../types';
import { injectUiLib } from './injectUiLib';
import { Messages } from './Messages';
import { updateState } from './updateState';

let configuration: LibConfig | undefined = undefined;

const messages = new Messages();
messages.startWindowListening();

const getAppliedCredenials = () => {
  return {
    apiKey: sessionStorage.getItem(API_KEY_LOCAL_STORAGE),
    apiUrl: sessionStorage.getItem(API_URL_LOCAL_STORAGE),
    branch: sessionStorage.getItem(BRANCH_LOCAL_STORAGE),
    authToken: sessionStorage.getItem(AUTH_TOKEN_LOCAL_STORAGE),
  };
};

const sameOrigin = (a: string | null, b: string | null) => {
  if (!a || !b) {
    return false;
  }
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch (e) {
    return false;
  }
};

// handshake with library
messages.listenWindow('TOLGEE_READY', (c: LibConfig) => {
  const firstHandshake = !configuration;
  configuration = c;
  const appliedCredentials = getAppliedCredenials();
  if (
    appliedCredentials.apiKey &&
    c.uiPresent === false &&
    (c.mode || c.config?.mode) === 'development'
  ) {
    injectUiLib(c.uiVersion);
  }
  updateState(configuration, messages);
  if (firstHandshake) {
    messages.sendToLib('TOLGEE_PLUGIN_READY');
  } else {
    // !!!! different message to make it backward compatible with old Tolgee
    // if we keep it same, it will cause infinite loop
    messages.sendToLib('TOLGEE_PLUGIN_UPDATED');
  }
  messages.sendToPlugin('TOLGEE_CONFIG_LOADED', configuration);
});

messages.listenWindow('TOLGEE_PING', () => {
  messages.sendToLib('TOLGEE_PONG');
});

// resend message to take screenshot to background
messages.listenWindow('TOLGEE_TAKE_SCREENSHOT', () => {
  messages.sendToPlugin('TOLGEE_TAKE_SCREENSHOT').then((response) => {
    messages.sendToLib('TOLGEE_SCREENSHOT_TAKEN', response);
  });
});

messages.startRuntimeListening();

// popup will ask if tolgee is present on the page
messages.listenRuntime('DETECT_TOLGEE', async () => {
  if (configuration) {
    messages.sendToPlugin('TOLGEE_CONFIG_LOADED', configuration);
  }
});

messages.listenRuntime('GET_CREDENTIALS', async () => getAppliedCredenials());

messages.listenRuntime('SET_CREDENTIALS', async (data) => {
  if (data.apiKey) {
    sessionStorage.setItem(API_KEY_LOCAL_STORAGE, data.apiKey);
  } else {
    sessionStorage.removeItem(API_KEY_LOCAL_STORAGE);
  }
  if (data.apiUrl) {
    sessionStorage.setItem(API_URL_LOCAL_STORAGE, data.apiUrl);
  } else {
    sessionStorage.removeItem(API_URL_LOCAL_STORAGE);
  }
  if (data.branch) {
    sessionStorage.setItem(BRANCH_LOCAL_STORAGE, data.branch);
  } else {
    sessionStorage.removeItem(BRANCH_LOCAL_STORAGE);
  }
  if (data.authToken) {
    sessionStorage.setItem(AUTH_TOKEN_LOCAL_STORAGE, data.authToken);
  } else {
    sessionStorage.removeItem(AUTH_TOKEN_LOCAL_STORAGE);
  }
  location.reload();
  updateState(configuration, messages);
});

// Background pushes a rotated access token here on refresh; update it in place so the SDK picks it up without a reload.
messages.listenRuntime('UPDATE_AUTH_TOKEN', async (data) => {
  if (sameOrigin(sessionStorage.getItem(API_URL_LOCAL_STORAGE), data.apiUrl)) {
    sessionStorage.setItem(AUTH_TOKEN_LOCAL_STORAGE, data.authToken);
  }
});
