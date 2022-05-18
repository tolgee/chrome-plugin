export type LibConfig = {
  uiPresent: boolean;
  uiVersion?: string;
  mode: 'production' | 'development';
  config: {
    apiUrl: '';
    apiKey: '';
    // @deprecated older versions
    mode?: 'production' | 'development';
  };
};
