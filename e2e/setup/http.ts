export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const waitForHttp = async (
  url: string,
  label: string,
  timeoutMs: number,
  isAlive: () => boolean = () => true
) => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = 'not attempted';
  while (Date.now() < deadline) {
    if (!isAlive()) {
      throw new Error(`${label} exited before it started serving ${url}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e;
    }
    await sleep(1000);
  }
  throw new Error(
    `${label} did not come up at ${url} within ${timeoutMs} ms (${lastError})`
  );
};

export const isPortInUse = async (port: number): Promise<boolean> => {
  try {
    await fetch(`http://localhost:${port}/`);
    return true;
  } catch {
    return false;
  }
};
