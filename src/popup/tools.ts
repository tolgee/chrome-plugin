export type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
  // OAuth access token (from "Connect with Tolgee"); an alternative to apiKey
  authToken?: string;
};

export const validateValues = (values?: Values | null) => {
  if ((values?.apiKey || values?.authToken) && values?.apiUrl) {
    return values;
  }
  return null;
};

export const isOAuth = (values?: Values | null) =>
  Boolean(values?.authToken && !values?.apiKey);

export const compareValues = (
  values1?: Values | null,
  values2?: Values | null
) => {
  return (
    values1?.apiKey === values2?.apiKey &&
    values1?.apiUrl === values2?.apiUrl &&
    values1?.authToken === values2?.authToken &&
    (values1?.branch || '') === (values2?.branch || '')
  );
};

export function normalizeUrl(url: string | undefined) {
  return url?.replace(/\/$/, '');
}
