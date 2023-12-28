type Values = {
  apiUrl?: string;
  apiKey?: string;
};

const getCurrentTab = async () => {
  return new Promise<chrome.tabs.Tab>((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      resolve(tabs[0]);
    })
  );
};

const getCurrentTabOrigin = async () => {
  const url = new URL((await getCurrentTab()).url!);
  return url.origin;
};

export const storeValues = async (values: Values | null) => {
  try {
    const origin = await getCurrentTabOrigin();
    await new Promise<void>((resolve) => {
      if (values?.apiKey && values?.apiUrl) {
        chrome.storage.local.set(
          {
            [origin]: {
              apiUrl: values.apiUrl,
              apiKey: values.apiKey,
            },
          },
          resolve
        );
      } else {
        chrome.storage.local.remove(origin, resolve);
      }
    });
  } catch (e) {
    console.error(e);
    return;
  }
};

export const loadValues = async () => {
  try {
    const origin = await getCurrentTabOrigin();
    return new Promise<Values>((resolve) =>
      chrome.storage.local.get(origin, (keys) => {
        const data = keys[origin];
        resolve({
          apiKey: data?.apiKey,
          apiUrl: data?.apiUrl,
        });
      })
    );
  } catch (e) {
    console.error(e);
    return {};
  }
};
