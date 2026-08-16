import browser from 'webextension-polyfill';

// The write helper for the per-origin "connected via OAuth here" marker, called by both the popup and the worker.
// `projectKey` is the scope of the token actually delivered here — the authoritative binding a page can't forge, so
// token delivery keys off it rather than the page-supplied projectId. `projectId` is only the popup's UX restore hint.
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

// The page origin's marker (null if none). Extension-written, so unforgeable — the trust anchor for "was connected".
export const loadOAuthMarker = async (
  origin: string
): Promise<{
  apiUrl: string;
  projectId?: number;
  projectKey?: string;
} | null> => {
  const stored = (await browser.storage.local.get(origin))[origin] as
    | {
        apiUrl?: string;
        oauth?: boolean;
        projectId?: number;
        projectKey?: string;
      }
    | undefined;
  if (!stored?.oauth || !stored.apiUrl) {
    return null;
  }
  return {
    apiUrl: stored.apiUrl,
    projectId: stored.projectId,
    projectKey: stored.projectKey,
  };
};
