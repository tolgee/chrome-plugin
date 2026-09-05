import browser from 'webextension-polyfill';
import { sameOrigin } from './url';

// The one storage.local[origin] record shape, covering both the api-key and OAuth forms a given origin can hold.
export type OriginRecord = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  oauth?: boolean;
  projectId?: number;
  projectKey?: string;
  siteKey?: string;
};

export const loadOriginRecord = async (
  origin: string
): Promise<OriginRecord | undefined> =>
  (await browser.storage.local.get(origin))[origin] as OriginRecord | undefined;

export const isOAuthConnection = (
  m: OriginRecord | undefined
): m is OriginRecord & { apiUrl: string } => Boolean(m?.oauth && m.apiUrl);

// An api key entered in the popup: pinned to the key's own project.
export const isApiKeyRecord = (
  m: OriginRecord | undefined
): m is OriginRecord & { apiUrl: string; apiKey: string; projectKey: string } =>
  Boolean(m && !m.oauth && m.apiUrl && m.apiKey && m.projectKey);

export type OriginConnection = {
  apiUrl: string;
  projectKey: string;
  projectId?: number;
} & ({ kind: 'oauth' } | { kind: 'apiKey'; apiKey: string });

export const loadOriginConnection = async (
  origin: string
): Promise<OriginConnection | null> => {
  const stored = await loadOriginRecord(origin);
  if (isApiKeyRecord(stored)) {
    return {
      kind: 'apiKey',
      apiUrl: stored.apiUrl,
      projectKey: stored.projectKey,
      projectId: stored.projectId,
      apiKey: stored.apiKey,
    };
  }
  if (isOAuthConnection(stored) && stored.projectKey) {
    return {
      kind: 'oauth',
      apiUrl: stored.apiUrl,
      projectKey: stored.projectKey,
      projectId: stored.projectId,
    };
  }
  return null;
};

export const storeOAuthConnection = async (
  origin: string,
  connection: {
    apiUrl: string;
    projectId?: number;
    projectKey: string;
    siteKey?: string;
  }
) => {
  await browser.storage.local.set({
    [origin]: {
      apiUrl: connection.apiUrl,
      oauth: true,
      projectId: connection.projectId,
      projectKey: connection.projectKey,
      siteKey: connection.siteKey,
    },
  });
};

export const storeApiKeyConnection = async (
  origin: string,
  connection: {
    apiUrl: string;
    apiKey: string;
    branch?: string;
    siteKey?: string;
    projectId?: number;
    projectKey?: string;
  }
) => {
  await browser.storage.local.set({ [origin]: connection });
};

export const updateConnectionHints = async (
  origin: string,
  hints: {
    projectId: number | undefined;
    branch: string | undefined;
    siteKey?: string;
  }
) => {
  const existing = await loadOriginRecord(origin);
  if (!isOAuthConnection(existing)) {
    return;
  }
  await browser.storage.local.set({
    [origin]: { ...existing, ...hints },
  });
};

export const clearConnection = (origin: string) =>
  browser.storage.local.remove(origin);

export const isSessionReferencedByAnyOrigin = async (
  apiUrl: string,
  projectKey: string
): Promise<boolean> => {
  const all = await browser.storage.local.get(null);
  return Object.values(all).some((value) => {
    const connection = value as OriginRecord;
    return (
      isOAuthConnection(connection) &&
      sameOrigin(connection.apiUrl, apiUrl) &&
      connection.projectKey === projectKey
    );
  });
};

// A stored connection means the origin *was* connected, not that its session is still live: it never expires on its own.
export const loadOAuthConnection = async (
  origin: string
): Promise<{
  apiUrl: string;
  projectId?: number;
  projectKey?: string;
} | null> => {
  const r = await loadOriginRecord(origin);
  return isOAuthConnection(r)
    ? { apiUrl: r.apiUrl, projectId: r.projectId, projectKey: r.projectKey }
    : null;
};
