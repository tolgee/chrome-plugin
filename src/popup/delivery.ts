import { LibConfig } from '../types';
import {
  appliedValuesFrom,
  credentialDelivery,
  isConnectedSession,
  PageAppliedCredentials,
  pageCredentials,
  sdkSupportsProxy,
  Values,
} from './tools';

export { credentialDelivery };

// See CredentialDelivery in types.ts for the protocol-2 requirement this gates on.
export const sdkTooOldFor = ({
  libConfig,
  hasSession,
  siteKeyScreen,
  activeValues,
}: {
  libConfig: LibConfig | null | undefined;
  hasSession: boolean;
  siteKeyScreen: boolean;
  activeValues: Values | null | undefined;
}): boolean =>
  !sdkSupportsProxy(libConfig) &&
  !siteKeyScreen &&
  !(hasSession && activeValues?.apiKey);

export const deliveryChanged = (
  page: PageAppliedCredentials | null | undefined,
  applied: Values | null,
  libConfig: LibConfig | null | undefined
): boolean =>
  Boolean(page?.apiKey) !== Boolean(pageCredentials(applied, libConfig).apiKey);

export type ResolvedAppliedValues = { applied: Values; redeliver: boolean };

// Null when applied isn't a connected session (see isConnectedSession) - the caller must leave the page's existing
// delivery alone rather than redeliver on it.
export const resolveAppliedValues = (
  page: PageAppliedCredentials | null | undefined,
  storedForApiKey: Values | null,
  libConfig: LibConfig | null | undefined
): ResolvedAppliedValues | null => {
  const applied = appliedValuesFrom(page, storedForApiKey);
  if (!isConnectedSession(applied)) {
    return null;
  }
  return { applied, redeliver: deliveryChanged(page, applied, libConfig) };
};
