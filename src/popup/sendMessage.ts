export const sendMessage = (type: string, data?: any) => {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id as number, { type, data }, resolve);
    });
  });
};
