import {
  confirmsKeyUnusable,
  confirmsTokenUnusable,
} from '../oauth/sessionRules';
import { OAuthUser, ProjectInfo } from './popupState';
import {
  credentialFetch,
  InconclusiveHttpStatus,
  ProxyFetchResponse,
} from './proxyFetch';
import { Values } from './tools';

const USER_PATH = '/v2/user';
const CURRENT_KEY_PATH = '/v2/api-keys/current';

export const checkOAuthSession = async (values: Values): Promise<OAuthUser> => {
  const user = await checkCredential(
    values,
    USER_PATH,
    confirmsTokenUnusable,
    'Invalid session'
  );
  return { oauth: true, userFullName: user.name as string };
};

export const checkApiKey = async (values: Values): Promise<ProjectInfo> => {
  const data = await checkCredential(
    values,
    CURRENT_KEY_PATH,
    confirmsKeyUnusable,
    'Invalid API key'
  );
  return {
    projectName: data.projectName as string,
    projectId: data.projectId as number,
    scopes: (data.scopes as string[]) ?? [],
    branchingEnabled: (data.branchingEnabled as boolean) ?? false,
  };
};

const checkCredential = async (
  values: Values,
  path: string,
  confirmsUnusable: (status: number) => boolean,
  rejectedMessage: string
): Promise<Record<string, unknown>> => {
  const r: ProxyFetchResponse = await credentialFetch(values, path);
  if (!r.ok) {
    if (confirmsUnusable(r.status)) {
      throw new Error(rejectedMessage);
    }
    throw new InconclusiveHttpStatus(r.status, path);
  }
  return r.json().catch(() => {
    throw new InconclusiveHttpStatus(r.status, path);
  });
};
