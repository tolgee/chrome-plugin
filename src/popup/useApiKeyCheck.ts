import { useEffect, useState } from 'react';
import { normalizeUrl } from './tools';

// Result of live-validating a typed API key against its server, before it's applied.
export type ApiKeyCheck =
  | null
  | 'loading'
  | 'invalid'
  | 'unreachable'
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
      // Send the key in the header, not the query string, so it can't leak via URLs/history/logs and an `&`/`#` in it
      // can't corrupt the request.
      fetch(`${url}/v2/api-keys/current`, { headers: { 'X-API-Key': apiKey } })
        .then((r) => {
          if (r.ok) {
            return r.json().then((data) => {
              if (!cancelled) setCheck({ projectName: data.projectName });
            });
          }
          // Only an auth/permission rejection means the key itself is wrong; any other status is a server problem, so
          // don't tell the user a valid key is invalid just because the backend is down or misconfigured.
          if (!cancelled) {
            setCheck(
              [400, 401, 403].includes(r.status) ? 'invalid' : 'unreachable'
            );
          }
        })
        .catch(() => {
          // Network failure, DNS, or a CORS block — the server couldn't be reached, which is not an invalid key.
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
