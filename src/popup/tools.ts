export type Values = {
  apiUrl?: string;
  apiKey?: string;
  branch?: string;
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
    values1?.apiKey === values2?.apiKey &&
    values1?.apiUrl === values2?.apiUrl &&
    (values1?.branch || '') === (values2?.branch || '')
  );
};

export function normalizeUrl(url: string | undefined) {
  return url?.replace(/\/$/, '');
}
