import { LibConfig } from '../types';
import { projectKeyFor } from '../oauth/sessionRules';
import { Values } from './tools';
import { CredentialsCheck, keyProjectId, State } from './popupState';

export const isSecondTolgeeInstance = (
  state: State,
  libData: LibConfig | null,
  frameId: number | null
): boolean =>
  Boolean(
    libData &&
      state.libConfig !== null &&
      state.frameId !== null &&
      frameId !== null &&
      state.frameId !== frameId
  );

export const pageValues = (libData: LibConfig | null): Values => ({
  apiKey: libData?.config?.apiKey,
  apiUrl: libData?.config?.apiUrl,
  branch: libData?.config?.branch,
});

// See isApiKeyRecord (oauth/originRecord.ts) for why a session without a projectKey isn't applied.
export const withKeyProject = (
  values: Values | null,
  check: CredentialsCheck
): Values | null => {
  if (!values?.apiKey || values.projectKey) {
    return values;
  }
  const projectId = keyProjectId(values.apiKey, check);
  return projectId === undefined
    ? null
    : { ...values, projectId, projectKey: projectKeyFor(projectId) };
};
