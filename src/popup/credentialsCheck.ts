import {
  confirmsKeyUnusable,
  confirmsTokenUnusable,
} from '../oauth/sessionRules';
import { OAuthUser, ProjectInfo } from './popupState';
import { credentialFetch, InconclusiveHttpStatus } from './proxyFetch';
import { Values } from './tools';

const USER_PATH = '/v2/user';
const CURRENT_KEY_PATH = '/v2/api-keys/current';

export const checkOAuthSession = async (values: Values): Promise<OAuthUser> => {
  const r = await credentialFetch(values, USER_PATH);
  if (!r.ok) {
    if (confirmsTokenUnusable(r.status)) {
      throw new Error('Invalid session');
    }
    throw new InconclusiveHttpStatus(r.status, USER_PATH);
  }
  const user = await r.json().catch(() => {
    throw new InconclusiveHttpStatus(r.status, USER_PATH);
  });
  return { oauth: true, userFullName: user.name };
};

export const checkApiKey = async (values: Values): Promise<ProjectInfo> => {
  const r = await credentialFetch(values, CURRENT_KEY_PATH);
  if (!r.ok) {
    if (confirmsKeyUnusable(r.status)) {
      throw new Error('Invalid API key');
    }
    throw new InconclusiveHttpStatus(r.status, CURRENT_KEY_PATH);
  }
  const data = await r.json().catch(() => {
    throw new InconclusiveHttpStatus(r.status, CURRENT_KEY_PATH);
  });
  return {
    projectName: data.projectName,
    projectId: data.projectId,
    scopes: data.scopes ?? [],
    userFullName: data.userFullName,
    branchingEnabled: data.branchingEnabled ?? false,
  };
};
