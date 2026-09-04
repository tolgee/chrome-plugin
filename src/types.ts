export type LibConfig = {
  uiPresent: boolean;
  uiVersion?: string;
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
