import browser from 'webextension-polyfill';

type Values = {
  apiUrl?: string;
  apiKey?: string;
};

const getCurrentTab = async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });

  return tabs[0];
};

const getCurrentTabOrigin = async () => {
  const url = new URL((await getCurrentTab()).url!);
  return url.origin;
};

export const storeValues = async (values: Values | null) => {
  try {
    const origin = await getCurrentTabOrigin();

    if (values?.apiKey && values?.apiUrl) {
      browser.storage.local.set({
        [origin]: {
          apiUrl: values.apiUrl,
          apiKey: values.apiKey,
        },
      });
    } else {
      browser.storage.local.remove(origin);
    }
  } catch (e) {
    console.error(e);
    return;
  }
};

export const loadValues = async () => {
  try {
    const origin = await getCurrentTabOrigin();
    const keys = await browser.storage.local.get(origin);
    const data = keys[origin] as Values;

    return {
      apiKey: data?.apiKey,
      apiUrl: data?.apiUrl,
    };
  } catch (e) {
    console.error(e);
    return {};
  }
};
