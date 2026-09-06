import {
  clearConnection,
  loadOriginRecord,
  storeApiKeyConnection,
  updateConnectionHints,
} from '../oauth/connection';
import { originOf } from '../oauth/url';
import { getActiveTab } from './activeTab';
import { Values } from './tools';

export const storeValues = async (values: Values | null) => {
  try {
    const origin = await getCurrentTabOrigin();

    if (values?.oauth && values?.apiUrl) {
      await updateConnectionHints(origin, {
        projectId: values.projectId,
        branch: values.branch,
        ...(values.siteKey ? { siteKey: values.siteKey } : {}),
      });
    } else if (values?.apiKey && values?.apiUrl) {
      await storeApiKeyConnection(origin, {
        apiUrl: values.apiUrl,
        apiKey: values.apiKey,
        branch: values.branch,
        siteKey: values.siteKey,
        projectId: values.projectId,
        projectKey: values.projectKey,
      });
    } else {
      await clearConnection(origin);
    }
  } catch (e) {
    console.error('[tolgee] storage error', e);
    return;
  }
};

export const loadValues = async () => {
  try {
    const origin = await getCurrentTabOrigin();
    const data = await loadOriginRecord(origin);

    return {
      apiKey: data?.apiKey,
      apiUrl: data?.apiUrl,
      branch: data?.branch,
      oauth: data?.oauth,
      projectId: data?.projectId,
      projectKey: data?.projectKey,
      siteKey: data?.siteKey,
    };
  } catch (e) {
    console.error('[tolgee] storage error', e);
    return {};
  }
};

const getCurrentTabOrigin = async () => originOf((await getActiveTab()).url!);
