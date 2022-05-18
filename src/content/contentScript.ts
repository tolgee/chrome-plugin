import { API_KEY_LOCAL_STORAGE, API_URL_LOCAL_STORAGE } from '../constants';
import { LibConfig } from '../types';
import { injectUiLib } from './injectUiLib';
import { Messages } from './Messages';
import { updateState } from './updateState';

let configuration: any = undefined;

const messages = new Messages();
messages.startWindowListening();

const getAppliedCredenials = () => {
  return {
    apiKey: sessionStorage.getItem(API_KEY_LOCAL_STORAGE),
    apiUrl: sessionStorage.getItem(API_URL_LOCAL_STORAGE),
  };
};

// handshake with library
messages.listenWindow('TOLGEE_READY', (c: LibConfig) => {
  if (!configuration) {
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
    messages.send('TOLGEE_PLUGIN_READY');
    messages.sendToLib('TOLGEE_CONFIG_LOADED', configuration);
  }
});

// resend message to take screenshot to background
messages.listenWindow('TOLGEE_TAKE_SCREENSHOT', () => {
  messages.sendToLib('TOLGEE_TAKE_SCREENSHOT').then((response) => {
    messages.send('TOLGEE_SCREENSHOT_TAKEN', response);
  });
});

messages.startRuntimeListening();

// popup will ask if tolgee is present on the page
messages.listenRuntime('DETECT_TOLGEE', (data, sendResponse) => {
  sendResponse(configuration);
});

messages.listenRuntime('GET_CREDENTIALS', (data, sendResponse) =>
  sendResponse(getAppliedCredenials())
);

messages.listenRuntime('SET_CREDENTIALS', (data, sendResponse) => {
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
  location.reload();
  sendResponse(true);
  updateState(configuration, messages);
});
