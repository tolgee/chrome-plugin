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
