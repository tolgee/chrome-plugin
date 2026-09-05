import { PROTOCOL_VERSION } from '../protocol';
import { LibConfig } from '../types';
import { acceptsCredentialDelivery } from './acceptsCredentialDelivery';
import {
  readAppliedCredentials,
  writeCredentialsIfChanged,
} from './credentialSink';
import { Messages } from './Messages';
import { updateState } from './updateState';

let configuration: LibConfig | undefined = undefined;

const messages = new Messages();
messages.startWindowListening();

// handshake with library
messages.listenWindow('TOLGEE_READY', (c: LibConfig) => {
  const firstHandshake = !configuration;
  configuration = c;
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
  messages.sendToLib('TOLGEE_PONG', { protocolVersion: PROTOCOL_VERSION });
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

messages.listenRuntime('GET_CREDENTIALS', async () =>
  readAppliedCredentials(sessionStorage)
);

messages.listenRuntime('SET_CREDENTIALS', async (data) => {
  if (
    !acceptsCredentialDelivery({
      currentOrigin: window.location.origin,
      isTopFrame: window.top === window.self,
      pageOrigin: data.pageOrigin,
    })
  ) {
    return;
  }
  if (writeCredentialsIfChanged(sessionStorage, data)) {
    location.reload();
  }
  updateState(configuration, messages);
});
