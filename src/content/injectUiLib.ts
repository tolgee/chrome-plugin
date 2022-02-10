function injectScript(src) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', (e) => reject(e.error));
    document.body.appendChild(script);
  });
}

let injectPromise = null as any as Promise<void>;

export function injectUiLib(version?: string) {
  if (!injectPromise) {
    injectPromise = injectScript(
      `https://unpkg.com/@tolgee/ui@${
        version || 'latest'
      }/dist/tolgee-ui.umd.min.js`
    );
  }
  return injectPromise;
}
