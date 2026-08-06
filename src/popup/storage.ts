import browser from 'webextension-polyfill';

type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  // OAuth sessions persist only a marker + backend url here; the token itself lives in the service worker's
  // tokenStore (kept fresh via refresh) and is re-fetched on load, so a short-lived token is never stored stale.
  oauth?: boolean;
};

const getCurrentTab = async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });

  return tabs[0];
};

const getCurrentTabOrigin = async () => {
  const url = new URL((await getCurrentTab()).url!);
  return url.origin;
};

export const storeValues = async (
  values: (Values & { authToken?: string }) | null
) => {
  try {
    const origin = await getCurrentTabOrigin();

    if (values?.authToken && values?.apiUrl) {
      browser.storage.local.set({
        [origin]: { apiUrl: values.apiUrl, oauth: true },
      });
    } else if (values?.apiKey && values?.apiUrl) {
      browser.storage.local.set({
        [origin]: {
          apiUrl: values.apiUrl,
          apiKey: values.apiKey,
          branch: values.branch,
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
      branch: data?.branch,
      oauth: data?.oauth,
    };
  } catch (e) {
    console.error(e);
    return {};
  }
};
