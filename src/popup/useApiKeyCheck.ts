import { useEffect, useState } from 'react';
import { normalizeUrl } from '../oauth/url';

export type ApiKeyCheck =
  | null
  | 'loading'
  | 'invalid'
  | 'unreachable'
  | { projectName: string };

export const isApiKeyValid = (
  check: ApiKeyCheck
): check is { projectName: string } =>
  check !== null && typeof check === 'object' && 'projectName' in check;

export const useApiKeyCheck = (
  apiUrl: string | undefined,
  apiKey: string | undefined,
  enabled: boolean
): ApiKeyCheck => {
  const [check, setCheck] = useState<ApiKeyCheck>(null);

  useEffect(() => {
    const url = normalizeUrl(apiUrl || '');
    if (!enabled || !apiKey || !url) {
      setCheck(null);
      return;
    }

    let cancelled = false;
    setCheck('loading');
    const timer = setTimeout(() => {
      fetch(`${url}/v2/api-keys/current`, { headers: { 'X-API-Key': apiKey } })
        .then((r) => {
          if (r.ok) {
            return r.json().then((data) => {
              if (!cancelled) setCheck({ projectName: data.projectName });
            });
          }
          if (!cancelled) {
            setCheck(
              [400, 401, 403].includes(r.status) ? 'invalid' : 'unreachable'
            );
          }
        })
        .catch(() => {
          if (!cancelled) setCheck('unreachable');
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, apiUrl, apiKey]);

  return check;
};
