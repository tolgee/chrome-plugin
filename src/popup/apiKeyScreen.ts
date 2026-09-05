import { LibConfig } from '../types';
import { projectIdOfApiKey } from '../oauth/apiKeyProject';
import { ApiKeyCheck, isApiKeyValid } from './apiKeyCheck';

export const EDIT_SCOPE = 'translations.edit';

export const scopesAllowEditing = (scopes: string[]): boolean =>
  scopes.includes(EDIT_SCOPE);

export const keyAllowsEditing = (check: ApiKeyCheck): boolean =>
  isApiKeyValid(check) && scopesAllowEditing(check.scopes);

export const connectButtonLabel = (check: ApiKeyCheck): string =>
  isApiKeyValid(check) ? `Connect to ${check.projectName}` : 'Connect';

export const serverPanelOpen = (toggled: boolean, serverInvalid: boolean) =>
  toggled || serverInvalid;

// A gear click on an unusable server keeps the panel toggled: letting it flip off would close the panel under the
// user's cursor as soon as the URL they are typing becomes valid.
export const serverGearToggled = (open: boolean, serverInvalid: boolean) =>
  serverInvalid || !open;

// The key a page in the SDK's development mode ships in its own config; the extension cannot remove it, only
// override it.
export const siteKeyFromCode = (
  libConfig: LibConfig | null | undefined
): string | undefined => {
  const mode = libConfig?.mode || libConfig?.config?.mode;
  const apiKey = libConfig?.config?.apiKey;
  return mode === 'development' && apiKey ? apiKey : undefined;
};

export const apiKeyProject = (
  apiKey: string | undefined,
  check: ApiKeyCheck
): number | undefined =>
  projectIdOfApiKey(apiKey) ??
  (isApiKeyValid(check) ? check.projectId : undefined);
