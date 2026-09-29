import {
  clearDismissal,
  isDismissed,
  storeDismissal,
} from '../oauth/dismissedPermissionsStore';
import { sendToBackground } from './sendToBackground';
import { oauthSessionLocator, storedOAuthSession } from './sessionLocator';

export const missingPermissionsToShow = async (): Promise<string[]> => {
  const locator = await oauthSessionLocator();
  if (!locator) {
    return [];
  }
  const res = (await sendToBackground('OAUTH_MISSING_PERMISSIONS', locator)) as
    | { missing?: string[] }
    | undefined;
  const missing = res?.missing ?? [];
  if (missing.length === 0) {
    return [];
  }
  return (await isDismissed(locator, missing)) ? [] : missing;
};

export const reauthorizeThenRecheck = async (): Promise<string[]> => {
  const locator = await oauthSessionLocator();
  if (locator) {
    await sendToBackground('OAUTH_REAUTHORIZE', locator);
    await clearDismissal(locator);
  }
  return missingPermissionsToShow();
};

export const forgetDismissal = async () => {
  const session = await storedOAuthSession();
  if (session) {
    await clearDismissal(session);
  }
};

export const dismissMissingPermissions = async (missing: string[]) => {
  const session = await storedOAuthSession();
  if (session) {
    await storeDismissal(session, missing);
  }
};
