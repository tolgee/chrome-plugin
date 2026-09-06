import { execFileSync } from 'node:child_process';
import { composeFile, env, log } from './env';
import { waitForHttp } from './http';

export type Platform = { url: string; docker: boolean };

const COMPOSE_PROJECT = 'tolgee-extension-e2e';

const compose = (args: string[], extensionId = '') =>
  execFileSync(
    'docker',
    ['compose', '-p', COMPOSE_PROJECT, '-f', composeFile, ...args],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TOLGEE_IMAGE: env.tolgeeImage,
        TOLGEE_PORT: String(env.tolgeePort),
        EXTENSION_ID: extensionId,
      },
    }
  );

export const startPlatform = async (extensionId: string): Promise<Platform> => {
  if (env.tolgeeUrl) {
    log(`using the Tolgee server at ${env.tolgeeUrl} (TOLGEE_URL)`);
    await waitForHttp(
      `${env.tolgeeUrl}/api/public/configuration`,
      'Tolgee (TOLGEE_URL)',
      30_000
    );
    return { url: env.tolgeeUrl, docker: false };
  }
  const url = `http://localhost:${env.tolgeePort}`;
  log(`starting ${env.tolgeeImage} on ${url} via docker compose`);
  compose(['up', '-d'], extensionId);
  await waitForHttp(`${url}/api/public/configuration`, 'Tolgee', 300_000);
  return { url, docker: true };
};

export const stopPlatform = () => {
  log('stopping the Tolgee docker container');
  compose(['down', '-v', '--remove-orphans']);
};
