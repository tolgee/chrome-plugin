import { CredentialDelivery, LibConfig } from '../types';
import { sameOrigin } from '../oauth/url';
import { SessionKind, supportsProxy } from '../protocol';
import { PageCredentials } from '../content/credentialSink';
import { isApiKeyRecord } from '../oauth/originRecord';
import { siteKeyFromCode } from './apiKeyScreen';

export type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  oauth?: boolean;
  projectId?: number;
  projectKey?: string;
  // The key the page's own code carries, remembered while apiKey overrides it: once the override is injected, the
  // page reports the override as its config key, so the site's own key is only known from here.
  siteKey?: string;
};

export const sdkSupportsProxy = (libConfig?: LibConfig | null): boolean =>
  supportsProxy(libConfig?.protocolVersion);

export const sessionKindOfValues = (
  values?: Values | null
): SessionKind | undefined =>
  isOAuth(values) ? 'oauth' : values?.apiKey ? 'apiKey' : undefined;

// The one formula for where an api key ends up: the worker if the SDK can be proxied, the page's own slot otherwise.
export const credentialDelivery = (
  libConfig: LibConfig | null | undefined,
  hasApiKey: boolean
): CredentialDelivery =>
  hasApiKey && !sdkSupportsProxy(libConfig) ? 'page' : 'proxy';

export const pageCredentials = (
  values: Values | null | undefined,
  libConfig: LibConfig | null | undefined
): PageCredentials => {
  const valid = validateValues(values);
  if (!valid) {
    return {};
  }
  const toPage =
    credentialDelivery(libConfig, Boolean(valid.apiKey)) === 'page';
  return {
    apiKey: toPage ? valid.apiKey : undefined,
    apiUrl: valid.apiUrl,
    branch: valid.branch,
    session: toPage ? undefined : sessionKindOfValues(valid),
    projectId: valid.projectId,
    projectKey: valid.projectKey,
  };
};

export type PageAppliedCredentials = PageCredentials;

export const appliedValuesFrom = (
  page: PageAppliedCredentials | null | undefined,
  stored: Values | null | undefined
): Values => {
  const projectId =
    page?.projectId === undefined ||
    page.projectId === null ||
    page.projectId === ''
      ? undefined
      : Number(page.projectId);
  const base: Values = {
    apiUrl: page?.apiUrl || undefined,
    branch: page?.branch || undefined,
    projectId: Number.isNaN(projectId) ? undefined : projectId,
    projectKey: page?.projectKey || undefined,
  };
  if (page?.apiKey) {
    return { ...base, apiKey: page.apiKey };
  }
  if (page?.session === 'oauth') {
    return { ...base, oauth: true };
  }
  if (
    page?.session === 'apiKey' &&
    stored?.apiKey &&
    !stored.oauth &&
    sameOrigin(stored.apiUrl, page.apiUrl) &&
    stored.projectKey === page.projectKey
  ) {
    return { ...base, apiKey: stored.apiKey };
  }
  return base;
};

export const declaredProjectId = (
  libConfig?: LibConfig | null
): number | undefined => {
  const raw = libConfig?.config?.projectId;
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
};

export const validateValues = (values?: Values | null) => {
  if ((values?.apiKey || values?.oauth) && values?.apiUrl) {
    return values;
  }
  return null;
};

// An api-key record also needs a projectKey to count as a connected session: the worker refuses to proxy for one
// without a project pin (see oauth/connection.ts isApiKeyRecord), so restoring it here would show "connected" for a
// session nothing will actually serve. A record written before projectKey existed (pre-1.9.0) falls through this.
export const isConnectedSession = (values?: Values | null): boolean =>
  values?.oauth
    ? Boolean(validateValues(values))
    : isApiKeyRecord(values ?? undefined);

export const isOAuth = (values?: Values | null) =>
  Boolean(values?.oauth && !values?.apiKey);

export const canApplyOnEnter = (
  hasSession: boolean,
  tab: 'login' | 'apiKey',
  values: Values | null | undefined,
  canApplyApiKey: boolean
): boolean =>
  Boolean(
    hasSession ? validateValues(values) : tab === 'apiKey' && canApplyApiKey
  );

export const compareValues = (
  values1?: Values | null,
  values2?: Values | null
) => {
  // sessionStorage hands back projectId as a string and apiKey as null; the stored copy holds a number and undefined.
  const str = (v?: string | null) => v || undefined;
  const num = (v?: number | string | null) =>
    v === undefined || v === null || v === '' ? undefined : Number(v);
  return (
    str(values1?.apiKey) === str(values2?.apiKey) &&
    str(values1?.apiUrl) === str(values2?.apiUrl) &&
    Boolean(values1?.oauth) === Boolean(values2?.oauth) &&
    num(values1?.projectId) === num(values2?.projectId) &&
    (values1?.branch || '') === (values2?.branch || '')
  );
};

type SessionSlots = {
  values: Values | null;
  storedValues: Values | null;
  appliedValues: Values | null;
};

export const activeValuesOf = ({
  values,
  storedValues,
  appliedValues,
}: SessionSlots): Values | null => appliedValues || storedValues || values;

export const hasSessionOf = ({ storedValues, appliedValues }: SessionSlots) =>
  Boolean(storedValues || appliedValues);

// A stored session that was not applied on this page leaves the slot alone: a fresh tab of the origin and a page
// switched off earlier look the same to the popup, only the page knows which it is.
export const pageEditing = ({
  storedValues,
  appliedValues,
  editingSwitchedOff,
}: Pick<SessionSlots, 'storedValues' | 'appliedValues'> & {
  editingSwitchedOff: boolean;
}): PageCredentials['editing'] =>
  appliedValues || !storedValues
    ? null
    : editingSwitchedOff
      ? 'off'
      : undefined;

export const siteKeyOf = (
  slots: SessionSlots,
  libConfig: LibConfig | null | undefined
): string | undefined =>
  hasSessionOf(slots)
    ? (slots.storedValues || slots.appliedValues)?.siteKey
    : (siteKeyFromCode(libConfig) && slots.values?.apiKey) || undefined;
