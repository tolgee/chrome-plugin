import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const e2eDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const repoRoot = path.resolve(e2eDir, '..');
export const cacheDir = path.join(e2eDir, '.cache');
export const stateFile = path.join(cacheDir, 'state.json');
export const distDir = path.join(repoRoot, 'dist-chrome');
export const composeFile = path.join(e2eDir, 'docker-compose.yml');

const stripSlash = (url: string | undefined) => url?.replace(/\/+$/, '');

export const env = {
  tolgeeUrl: stripSlash(process.env.TOLGEE_URL),
  tolgeeImage: process.env.TOLGEE_IMAGE || 'tolgee/tolgee:latest',
  tolgeePort: Number(process.env.TOLGEE_PORT || 8299),
  tolgeeJsDir: process.env.TOLGEE_JS_DIR,
  tolgeeJsBranch: process.env.TOLGEE_JS_BRANCH,
  testappPort: Number(process.env.TESTAPP_PORT || 5173),
};

export const log = (message: string) => console.log(`[e2e] ${message}`);
