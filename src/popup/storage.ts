import browser from 'webextension-polyfill';
import { OriginRecord, updateMarkerHints } from '../oauth/marker';
import { originOf } from '../oauth/url';
import { getActiveTab } from './activeTab';
import { Values } from './tools';

export const storeValues = async (values: Values | null) => {
  try {
    const origin = await getCurrentTabOrigin();

    if (values?.oauth && values?.apiUrl) {
      await updateMarkerHints(origin, {
        projectId: values.projectId,
        branch: values.branch,
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
    const data = keys[origin] as OriginRecord;

    return {
      apiKey: data?.apiKey,
      apiUrl: data?.apiUrl,
      branch: data?.branch,
      oauth: data?.oauth,
      projectId: data?.projectId,
      projectKey: data?.projectKey,
    };
  } catch (e) {
    console.error('[tolgee] storage error', e);
    return {};
  }
};

const getCurrentTabOrigin = async () => originOf((await getActiveTab()).url!);
