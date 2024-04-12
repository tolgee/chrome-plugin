export const sendMessage = (type: string, data?: any) => {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(
        tabs[0].id as number,
        { type, data },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          }
          resolve(response);
        }
      );
    });
  });
};
