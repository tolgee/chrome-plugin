import browser from 'webextension-polyfill';
import { storeOAuthMarker } from '../oauth/marker';
import { projectKeyForToken } from '../oauth/tokenScope';
import { originOf } from '../oauth/url';
import { getActiveTab } from './activeTab';
import { Values } from './tools';

// The per-origin record persisted in browser.storage.local — distinct from the live form `Values`: it carries the
// OAuth `oauth` marker flag and never the short-lived `authToken` (the token lives in the service worker's tokenStore).
type PersistedValues = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  oauth?: boolean;
  projectId?: number;
};

export const storeValues = async (values: Values | null) => {
  try {
    const origin = await getCurrentTabOrigin();

    if (values?.authToken && values?.apiUrl) {
      await storeOAuthMarker(origin, {
        apiUrl: values.apiUrl,
        projectId: values.projectId,
        projectKey: projectKeyForToken(values.authToken),
      });
    } else if (values?.apiKey && values?.apiUrl) {
      await browser.storage.local.set({
        [origin]: {
          apiUrl: values.apiUrl,
          apiKey: values.apiKey,
          branch: values.branch,
        },
      });
    } else {
      await browser.storage.local.remove(origin);
    }
  } catch (e) {
    console.error('[tolgee] storage error', e);
    return;
  }
};

export const loadValues = async () => {
  try {
    const origin = await getCurrentTabOrigin();
    const keys = await browser.storage.local.get(origin);
    const data = keys[origin] as PersistedValues;

    return {
      apiKey: data?.apiKey,
      apiUrl: data?.apiUrl,
      branch: data?.branch,
      oauth: data?.oauth,
      projectId: data?.projectId,
    };
  } catch (e) {
    console.error('[tolgee] storage error', e);
    return {};
  }
};

const getCurrentTabOrigin = async () => originOf((await getActiveTab()).url!);
