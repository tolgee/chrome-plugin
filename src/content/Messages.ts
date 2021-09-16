type Listener = {
  type: string;
  callback: (data) => void;
};

type RuntimeCallbackType = (
  data,
  responseCallback: (response?) => void
) => void;

type RuntimeListener = {
  type: string;
  callback: RuntimeCallbackType;
};

export type Message = {
  data: any;
  type: string;
};

export type RuntimeMessage = {} & Message;

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
    // noinspection JSDeprecatedSymbols
    chrome.runtime.onMessage.addListener(
      (request: RuntimeMessage, sender, sendResponse) => {
        this.listenersRuntime.forEach((listener) => {
          if (listener.type == request.type) {
            listener.callback(request.data, sendResponse);
          }
        });
      }
    );
  };

  readonly listenRuntime = (type: string, callback: RuntimeCallbackType) => {
    this.listenersRuntime.push({ type, callback });
  };

  readonly listenWindow = (type: string, callback: (data) => void) => {
    this.listenersWindow.push({ type, callback });
  };

  readonly send = (type: string, data?: any) => {
    window.postMessage({ type, data }, window.origin);
  };

  readonly sendToLib = (type: string, data?: any) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, data }, (data) => resolve(data));
    });
  };
}
