import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir, env, log, repoRoot } from './env';

const REPO = 'https://github.com/tolgee/tolgee-js.git';
const IN_CONTEXT_FILE = 'tolgee-in-context-tools.umd.min.js';
const TESTAPP = '@tolgee/react-testapp';

const run = (cmd: string, args: string[], cwd: string) => {
  log(`${path.basename(cwd)}$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
};

const capture = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const currentExtensionBranch = (): string | undefined => {
  try {
    const branch = capture(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      repoRoot
    );
    return branch === 'HEAD' ? undefined : branch;
  } catch {
    return undefined;
  }
};

// The extension and tolgee-js usually change together, so a tolgee-js branch named like the extension's is preferred.
const resolveBranch = (): string => {
  const wanted = env.tolgeeJsBranch || currentExtensionBranch();
  if (!wanted || wanted === 'main') {
    return 'main';
  }
  const found = capture(
    'git',
    ['ls-remote', '--heads', REPO, `refs/heads/${wanted}`],
    repoRoot
  );
  if (found) {
    log(`tolgee-js has a branch named ${wanted}, using it`);
    return wanted;
  }
  log(`tolgee-js has no branch named ${wanted}, using main`);
  return 'main';
};

const checkout = (dir: string, branch: string) => {
  if (fs.existsSync(path.join(dir, '.git'))) {
    run('git', ['fetch', '--depth', '1', 'origin', branch], dir);
    run('git', ['checkout', '--force', '-B', branch, 'FETCH_HEAD'], dir);
    return;
  }
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  run(
    'git',
    ['clone', '--depth', '1', '--branch', branch, REPO, dir],
    repoRoot
  );
};

const inContextBuild = (dir: string) =>
  path.join(dir, 'packages', 'web', 'dist', IN_CONTEXT_FILE);

const build = (dir: string) =>
  // The testapp consumes the workspace @tolgee/react (and through it @tolgee/web), not a published version.
  run(
    'pnpm',
    [
      'turbo',
      'run',
      'build',
      '--filter=@tolgee/web...',
      `--filter=${TESTAPP}^...`,
    ],
    dir
  );

/** Returns the tolgee-js checkout whose react testapp is ready to be served. */
export const prepareTolgeeJs = (): string => {
  let dir: string;
  if (env.tolgeeJsDir) {
    dir = path.resolve(env.tolgeeJsDir);
    if (!fs.existsSync(path.join(dir, 'testapps', 'react', 'package.json'))) {
      throw new Error(
        `TOLGEE_JS_DIR=${env.tolgeeJsDir} is not a tolgee-js checkout`
      );
    }
    log(`using tolgee-js at ${dir} (TOLGEE_JS_DIR)`);
    if (!fs.existsSync(inContextBuild(dir))) {
      build(dir);
    }
  } else {
    dir = path.join(cacheDir, 'tolgee-js');
    checkout(dir, resolveBranch());
    run('pnpm', ['install', '--frozen-lockfile'], dir);
    build(dir);
  }
  fs.copyFileSync(
    inContextBuild(dir),
    path.join(dir, 'testapps', 'react', 'public', IN_CONTEXT_FILE)
  );
  return dir;
};

export const startTestapp = (
  dir: string,
  port: number,
  tolgeeUrl: string,
  projectId: number
): ChildProcess => {
  fs.mkdirSync(cacheDir, { recursive: true });
  const logFile = fs.openSync(path.join(cacheDir, `testapp-${port}.log`), 'w');
  log(`starting ${TESTAPP} for project ${projectId} on port ${port}`);
  const child = spawn(
    'pnpm',
    [
      '--filter',
      TESTAPP,
      'run',
      'develop',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: dir,
      env: {
        ...process.env,
        VITE_APP_TOLGEE_API_URL: tolgeeUrl,
        VITE_APP_TOLGEE_PROJECT_ID: String(projectId),
        VITE_APP_TOLGEE_API_KEY: '',
        VITE_APP_IN_CONTEXT_URL: `/${IN_CONTEXT_FILE}`,
      },
      // Its own process group, so that stopping it also stops the vite process pnpm spawns underneath.
      detached: true,
      stdio: ['ignore', logFile, logFile],
    }
  );
  child.unref();
  return child;
};

export const stopProcessGroup = (pid: number) => {
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, 'SIGTERM');
      return;
    } catch {
      // ESRCH: already gone, or no group with that id
    }
  }
};
