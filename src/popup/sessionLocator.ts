import { getActiveTabOrigin } from './activeTab';
import { loadValues } from './storage';
import { Values } from './tools';

export const oauthSessionLocator = async (stored?: Values) => {
  const session = await storedOAuthSession(stored);
  return session && { ...session, pageOrigin: await getActiveTabOrigin() };
};

export const storedOAuthSession = async (stored?: Values) => {
  const values = stored ?? (await loadValues());
  return values.oauth && values.apiUrl
    ? { apiUrl: values.apiUrl, projectKey: values.projectKey }
    : null;
};
