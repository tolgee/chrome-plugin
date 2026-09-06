import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { distDir, log, repoRoot } from './env';

const BUILD_INPUTS = [
  'src',
  'icons',
  'manifest.json',
  'index.html',
  'vite.config.chrome.ts',
  'package.json',
];

const newestMtime = (entry: string): number => {
  if (!fs.existsSync(entry)) {
    return 0;
  }
  const stat = fs.statSync(entry);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }
  return Math.max(
    stat.mtimeMs,
    ...fs
      .readdirSync(entry)
      .map((child) => newestMtime(path.join(entry, child)))
  );
};

export const ensureExtensionBuilt = () => {
  const manifest = path.join(distDir, 'manifest.json');
  const builtAt = fs.existsSync(manifest) ? fs.statSync(manifest).mtimeMs : 0;
  const changedAt = Math.max(
    ...BUILD_INPUTS.map((input) => newestMtime(path.join(repoRoot, input)))
  );
  if (builtAt >= changedAt) {
    log(`using existing build in ${distDir}`);
    return;
  }
  log(
    'dist-chrome is missing or older than the sources, running npm run build'
  );
  execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
};
