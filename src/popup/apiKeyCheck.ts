export type VerifiedApiKey = {
  projectName: string;
  projectId: number;
  scopes: string[];
};

export type ApiKeyCheck =
  | null
  | 'loading'
  | 'invalid'
  | 'unreachable'
  | VerifiedApiKey;

export const isApiKeyValid = (check: ApiKeyCheck): check is VerifiedApiKey =>
  check !== null && typeof check === 'object' && 'projectName' in check;
