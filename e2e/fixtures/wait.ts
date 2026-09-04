export const waitFor = async <T>(
  probe: () =>
    | Promise<T | undefined | null | false>
    | T
    | undefined
    | null
    | false,
  label: string,
  timeoutMs = 30_000
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
};
