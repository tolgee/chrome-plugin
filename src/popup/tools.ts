export type Values = {
  apiUrl?: string;
  apiKey?: string;
};

export const validateValues = (values?: Values | null) => {
  if (values?.apiKey && values?.apiUrl) {
    return values;
  }
  return null;
};

export const compareValues = (
  values1?: Values | null,
  values2?: Values | null
) => {
  return (
    values1?.apiKey === values2?.apiKey && values2?.apiUrl === values2?.apiUrl
  );
};

export function normalizeUrl(url: string | undefined) {
  return url?.replace(/\/$/, '');
}
