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
};

export const isConnectedMarker = (
  m: OriginRecord | undefined
): m is OriginRecord & { apiUrl: string } => Boolean(m?.oauth && m.apiUrl);

export const storeOAuthMarker = async (
  origin: string,
  marker: { apiUrl: string; projectId?: number; projectKey: string }
) => {
  await browser.storage.local.set({
    [origin]: {
      apiUrl: marker.apiUrl,
      oauth: true,
      projectId: marker.projectId,
      projectKey: marker.projectKey,
    },
  });
};

export const updateMarkerHints = async (
  origin: string,
  hints: { projectId: number | undefined; branch: string | undefined }
) => {
  const existing = (await browser.storage.local.get(origin))[
    origin
  ] as OriginRecord;
  if (!isConnectedMarker(existing)) {
    return;
  }
  await browser.storage.local.set({
    [origin]: { ...existing, ...hints },
  });
};

export const clearMarker = (origin: string) =>
  browser.storage.local.remove(origin);

export const isSessionReferencedByAnyOrigin = async (
  apiUrl: string,
  projectKey: string
): Promise<boolean> => {
  const all = await browser.storage.local.get(null);
  return Object.values(all).some((value) => {
    const marker = value as OriginRecord;
    return (
      isConnectedMarker(marker) &&
      sameOrigin(marker.apiUrl, apiUrl) &&
      marker.projectKey === projectKey
    );
  });
};

// A marker means the origin *was* connected, not that the connection is still live — it never expires on its own.
export const loadOAuthMarker = async (
  origin: string
): Promise<{
  apiUrl: string;
  projectId?: number;
  projectKey?: string;
} | null> => {
  const stored = (await browser.storage.local.get(origin))[origin] as
    | OriginRecord
    | undefined;
  if (!isConnectedMarker(stored)) {
    return null;
  }
  return {
    apiUrl: stored.apiUrl,
    projectId: stored.projectId,
    projectKey: stored.projectKey,
  };
};
