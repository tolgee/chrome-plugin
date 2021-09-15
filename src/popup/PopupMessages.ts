export class PopupMessages {
  static send = (type, data?) => {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { type, data }, resolve);
      });
    });
  };
}
