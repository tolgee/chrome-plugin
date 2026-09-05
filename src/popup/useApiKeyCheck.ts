import { useEffect, useState } from 'react';
import { normalizeUrl } from '../oauth/url';
import { ApiKeyCheck } from './apiKeyCheck';
import { checkApiKey } from './credentialsCheck';
import { isInconclusiveSessionCheckError } from './proxyFetch';

const TYPING_DEBOUNCE_MS = 400;

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
      checkApiKey({ apiUrl: url, apiKey })
        .then(({ projectName, projectId, scopes }) => {
          if (!cancelled) {
            setCheck({ projectName, projectId, scopes });
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setCheck(
              isInconclusiveSessionCheckError(e) ? 'unreachable' : 'invalid'
            );
          }
        });
    }, TYPING_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, apiUrl, apiKey]);

  return check;
};
