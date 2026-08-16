export type LibConfig = {
  uiPresent: boolean;
  uiVersion?: string;
  mode: 'production' | 'development';
  config: {
    apiUrl: '';
    apiKey: '';
    branch?: string;
    projectId?: number | string;
    // @deprecated older versions
    mode?: 'production' | 'development';
  };
};
