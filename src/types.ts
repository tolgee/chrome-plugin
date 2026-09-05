import { SessionKind } from './protocol';

export type LibConfig = {
  uiPresent: boolean;
  uiVersion?: string;
  // See PROTOCOL_VERSION in protocol.ts; absent on SDKs from before the proxied-request protocol.
  protocolVersion?: number;
  mode: 'production' | 'development';
  config: {
    apiUrl: string;
    apiKey: string;
    branch?: string;
    projectId?: number | string;
    // @deprecated older versions
    mode?: 'production' | 'development';
  };
};

// Signing in (OAuth) routes the page's requests through the worker, so it needs an SDK on protocol 2 (see
// PROTOCOL_VERSION in protocol.ts) whatever the popup's form holds; an api key already in effect is instead handed
// to an older SDK directly. 'proxy' keeps the key in the worker; 'page' hands it to the page's sessionStorage.
export type CredentialDelivery = 'proxy' | 'page';

// The SET_CREDENTIALS / GET_CREDENTIALS payload: what the extension writes into (and reads back from) the page's
// session-storage slots. Each field maps onto one slot in sessionStorageKeys.ts.
export type PageCredentials = {
  // Only ever set for a page delivery (see CredentialDelivery); a proxied session leaves the slot cleared.
  apiKey?: string | null;
  apiUrl?: string | null;
  branch?: string | null;
  session?: SessionKind | null;
  projectId?: string | number | null;
  projectKey?: string | null;
  // Absent is not 'clear' here, unlike every field above, where absent and null both clear: it leaves the slot
  // exactly as the page already has it (see popup/tools.ts pageEditing).
  editing?: 'off' | 'clear';
};
