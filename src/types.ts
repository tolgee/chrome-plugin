export type LibConfig = {
  uiPresent: boolean;
  uiVersion?: string;
  // See PROTOCOL_VERSION in constants.ts; absent on SDKs from before the proxied-request protocol.
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
