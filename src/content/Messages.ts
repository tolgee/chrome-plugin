import browser from 'webextension-polyfill';

type Listener = {
  type: string;
  callback: (data: any) => void;
};

type RuntimeCallbackType = (data: any) => Promise<any>;

type RuntimeListener = {
  type: string;
  callback: RuntimeCallbackType;
};

export type Message = {
  data: any;
  type: string;
};

export type RuntimeMessage = object & Message;

type PgEvent = { data: Message } & MessageEvent;

export class Messages {
  private listenersWindow: Listener[] = [];
  private listenersRuntime: RuntimeListener[] = [];

  readonly startWindowListening = () => {
    const receiveMessage = (event: PgEvent) => {
      if (event.source !== window) {
        return;
      }

      this.listenersWindow.forEach((listener) => {
        if (listener.type == event.data.type) {
          listener.callback(event.data.data);
        }
      });
    };

    window.addEventListener('message', receiveMessage, false);
  };

  readonly startRuntimeListening = () => {
    browser.runtime.onMessage.addListener((request, _, sendResponse) => {
      const { type, data } = request as RuntimeMessage;

      this.listenersRuntime.forEach(async (listener) => {
        if (listener.type == type) {
          const response = await listener.callback(data);

          sendResponse(response);
        }
      });
      return true;
    });
  };

  readonly listenRuntime = (type: string, callback: RuntimeCallbackType) => {
    this.listenersRuntime.push({ type, callback });
  };

  readonly listenWindow = (type: string, callback: (data: any) => void) => {
    this.listenersWindow.push({ type, callback });
  };

  readonly sendToLib = (type: string, data?: any) => {
    window.postMessage({ type, data }, window.origin);
  };

  readonly sendToPlugin = (type: string, data?: any) => {
    return browser.runtime.sendMessage({ type, data });
  };
}
