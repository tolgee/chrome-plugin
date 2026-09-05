import { LibConfig } from '../types';
import { credentialDelivery, Values } from './tools';
import { projectUrl } from '../oauth/url';
import { scopesAllowEditing } from './apiKeyScreen';
import {
  branchableProjectId,
  BranchOption,
  CredentialsCheck,
  isOAuthUser,
  isProjectInfo,
  ProjectOption,
} from './popupState';
import { Session } from './sessionCopy';

type Args = {
  isOauthSession: boolean;
  siteKeyScreen: boolean;
  siteKey: string | undefined;
  activeValues: Values | null;
  credentialsCheck: CredentialsCheck;
  declaredProject: ProjectOption | null;
  branches: BranchOption[] | null;
  libConfig: LibConfig | null;
};

export const connectedPanelProps = ({
  isOauthSession,
  siteKeyScreen,
  siteKey,
  activeValues,
  credentialsCheck,
  declaredProject,
  branches,
  libConfig,
}: Args) => {
  const oauthUser = isOAuthUser(credentialsCheck) ? credentialsCheck : null;
  const projectCheck = isProjectInfo(credentialsCheck)
    ? credentialsCheck
    : null;
  const viewOnly = Boolean(
    projectCheck && !scopesAllowEditing(projectCheck.scopes)
  );
  const session: Session = isOauthSession
    ? { kind: 'oauth', userFullName: oauthUser?.userFullName ?? null }
    : siteKeyScreen
      ? {
          kind: 'apiKey',
          apiKey: siteKey || '',
          source: 'site',
          viewOnly,
          delivery: 'page',
        }
      : {
          kind: 'apiKey',
          apiKey: activeValues?.apiKey ?? '',
          source: siteKey ? 'override' : 'own',
          viewOnly,
          delivery: credentialDelivery(
            libConfig,
            Boolean(activeValues?.apiKey)
          ),
        };
  const projectName = isOauthSession
    ? declaredProject?.name ?? null
    : projectCheck?.projectName ?? null;
  const projectId = isOauthSession
    ? declaredProject?.id
    : projectCheck?.projectId;
  const branch =
    branchableProjectId(credentialsCheck, declaredProject) === null ||
    branches?.length === 0
      ? null
      : {
          override: activeValues?.branch || undefined,
          pageBranch: libConfig?.config?.branch || undefined,
          options: branches,
        };
  return {
    session,
    projectName,
    projectUrl: projectUrl(activeValues?.apiUrl, projectId),
    branch,
  };
};
