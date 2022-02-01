import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * When apply function is called
 * applyRequired will be true next render
 * it's used for syncing state with storage/sessionStorage only in certain moments
 */
export const useApplier = () => {
  const [, forceRender] = useState(0);
  const applyRequired = useRef(false);

  const apply = useCallback(() => {
    applyRequired.current = true;
    forceRender((i) => i + 1);
  }, []);

  useEffect(() => {
    applyRequired.current = false;
  });

  return { applyRequired: applyRequired.current, apply } as const;
};
