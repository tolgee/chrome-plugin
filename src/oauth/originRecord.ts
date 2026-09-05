export type OriginRecord = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  oauth?: boolean;
  projectId?: number;
  projectKey?: string;
  siteKey?: string;
};

export const isOAuthConnection = (
  record: OriginRecord | undefined
): record is OriginRecord & { apiUrl: string } =>
  Boolean(record?.oauth && record.apiUrl);

// The worker answers a page's request by the project this record pins, so an api-key record without one leaves
// the in-context tools dead - the record is refused rather than served unpinned.
export const isApiKeyRecord = (
  record: OriginRecord | undefined
): record is OriginRecord & {
  apiUrl: string;
  apiKey: string;
  projectKey: string;
} =>
  Boolean(
    record &&
      !record.oauth &&
      record.apiUrl &&
      record.apiKey &&
      record.projectKey
  );
