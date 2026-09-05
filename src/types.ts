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

// How an api key entered in the popup reaches the Tolgee API: 'proxy' keeps it in the worker, which sends the SDK's
// requests; 'page' hands it to the page's sessionStorage for an SDK from before the proxied-request protocol.
export type CredentialDelivery = 'proxy' | 'page';
