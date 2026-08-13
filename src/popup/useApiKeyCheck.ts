import { useEffect, useState } from 'react';
import { normalizeUrl } from './tools';

// Result of live-validating a typed API key against its server, before it's applied.
export type ApiKeyCheck =
  | null
  | 'loading'
  | 'invalid'
  | { projectName: string };

/**
 * Validates the API key the user is typing against `/v2/api-keys/current` on the target server, so an invalid key
 * (e.g. a cloud key pointed at a local backend) can't be silently applied. Debounced; only runs while `enabled`.
 */
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
      fetch(`${url}/v2/api-keys/current?ak=${apiKey}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          if (!cancelled) {
            setCheck({ projectName: data.projectName });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCheck('invalid');
          }
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, apiUrl, apiKey]);

  return check;
};
