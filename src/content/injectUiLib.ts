function injectScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', (e) => reject(e.error));
    document.body.appendChild(script);
  });
}

let injectPromise = null as any as Promise<void>;

const CDN_URL = 'https://cdn.jsdelivr.net/npm';

export function injectUiLib(version?: string) {
  if (!injectPromise) {
    injectPromise = injectScript(
      `${CDN_URL}/@tolgee/ui@${version || 'latest'}/dist/tolgee-ui.umd.min.js`
    );
  }
  return injectPromise;
}
