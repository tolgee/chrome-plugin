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

// An api-key session the worker cannot serve is not applied at all: it answers a page's request by the project the
// origin record pins, so a session slot without one leaves the page's in-context tools dead.
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
