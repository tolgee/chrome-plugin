import { CredentialDelivery, LibConfig } from '../types';
import {
  PageAppliedCredentials,
  pageCredentials,
  sdkSupportsProxy,
  Values,
} from './tools';

export const credentialDelivery = (
  libConfig: LibConfig | null | undefined
): CredentialDelivery => (sdkSupportsProxy(libConfig) ? 'proxy' : 'page');

// Signing in routes the page's requests through the worker, so the sign-in screen is gated on that protocol whatever
// the form holds; a key already in effect is handed to an older SDK instead, which uses it directly.
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

// The page keeps using whatever its slots hold, so a session applied to an SDK that has since been upgraded past the
// proxy protocol (or downgraded below it) has to be written again to reach the page the way this SDK expects it.
export const deliveryChanged = (
  page: PageAppliedCredentials | null | undefined,
  applied: Values | null,
  libConfig: LibConfig | null | undefined
): boolean =>
  Boolean(page?.apiKey) !== Boolean(pageCredentials(applied, libConfig).apiKey);
