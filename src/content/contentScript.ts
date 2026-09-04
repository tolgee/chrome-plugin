import {
  API_KEY_SESSION_STORAGE,
  API_URL_SESSION_STORAGE,
  AUTH_TOKEN_SESSION_STORAGE,
  BRANCH_SESSION_STORAGE,
  PROJECT_ID_SESSION_STORAGE,
  PROJECT_KEY_SESSION_STORAGE,
} from '../constants';
import { LibConfig } from '../types';
import { acceptsCredentialDelivery } from './acceptsCredentialDelivery';
import { acceptTokenPush, writeCredentialsIfChanged } from './credentialSink';
import { injectUiLib } from './injectUiLib';
import { Messages } from './Messages';
import { updateState } from './updateState';

let configuration: LibConfig | undefined = undefined;

const messages = new Messages();
messages.startWindowListening();

const getAppliedCredentials = () => {
  return {
    apiKey: sessionStorage.getItem(API_KEY_SESSION_STORAGE),
    apiUrl: sessionStorage.getItem(API_URL_SESSION_STORAGE),
    branch: sessionStorage.getItem(BRANCH_SESSION_STORAGE),
    authToken: sessionStorage.getItem(AUTH_TOKEN_SESSION_STORAGE),
    projectId: sessionStorage.getItem(PROJECT_ID_SESSION_STORAGE),
    projectKey: sessionStorage.getItem(PROJECT_KEY_SESSION_STORAGE),
  };
};

// handshake with library
messages.listenWindow('TOLGEE_READY', (c: LibConfig) => {
  const firstHandshake = !configuration;
  configuration = c;
  const appliedCredentials = getAppliedCredentials();
  if (
    appliedCredentials.apiKey &&
    c.uiPresent === false &&
    (c.mode || c.config?.mode) === 'development'
  ) {
    injectUiLib(c.uiVersion);
  }
  if (appliedCredentials.authToken && appliedCredentials.apiUrl) {
    messages.sendToPlugin('OAUTH_TAB_CONNECTED', {
      apiUrl: appliedCredentials.apiUrl,
    });
  } else {
    // Tells the worker this tab is no longer holding a token (e.g. the user just un-applied it), so the tab
    // registry — the worker's own view of which tabs to keep refreshing and pushing to — drops it symmetrically
    // with how OAUTH_TAB_CONNECTED adds it above.
    messages.sendToPlugin('OAUTH_TAB_DISCONNECTED');
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

messages.listenWindow('TOLGEE_OPEN_PLUGIN', () => {
  messages.sendToPlugin('OPEN_POPUP');
});

messages.startRuntimeListening();

// popup will ask if tolgee is present on the page
messages.listenRuntime('DETECT_TOLGEE', async () => {
  if (configuration) {
    messages.sendToPlugin('TOLGEE_CONFIG_LOADED', configuration);
  }
});

messages.listenRuntime('GET_CREDENTIALS', async () => getAppliedCredentials());

const acceptsDelivery = (pageOrigin?: string) =>
  acceptsCredentialDelivery({
    currentOrigin: window.location.origin,
    isTopFrame: window.top === window.self,
    pageOrigin,
  });

messages.listenRuntime('SET_CREDENTIALS', async (data) => {
  if (!acceptsDelivery(data.pageOrigin)) {
    return;
  }
  if (writeCredentialsIfChanged(sessionStorage, data)) {
    location.reload();
  }
  updateState(configuration, messages);
});

messages.listenRuntime('UPDATE_AUTH_TOKEN', async (data) => {
  if (acceptsDelivery(data.pageOrigin)) {
    acceptTokenPush(sessionStorage, data);
  }
});
