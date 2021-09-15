import { Messages } from './Messages';

let configuration = undefined;

const messages = new Messages();
messages.startWindowListening();

// handshake with library
messages.listenWindow('TOLGEE_READY', (c) => {
  if (!configuration) {
    configuration = c;
    messages.send('TOLGEE_PLUGIN_READY');
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
messages.listenRuntime('DETECT_TOLGEE', (data, sendResponse) =>
  sendResponse(Boolean(configuration))
);
