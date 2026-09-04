import fs from 'node:fs';
import path from 'node:path';
import { stateFile } from './env';
import type { OAuthAvailability } from './oauthProbe';
import type { SeedCleanup } from './seed';

export type TestApp = { url: string; projectId: number; projectName: string };

export type RunState = {
  extensionId: string;
  distDir: string;
  tolgeeUrl: string;
  docker: boolean;
  oauth: OAuthAvailability;
  user: { username: string; password: string };
  apps: TestApp[];
  apiKey: string;
  seed: SeedCleanup;
  tolgeeJsDir: string;
  testappPids: number[];
};

export const readState = (): RunState =>
  JSON.parse(fs.readFileSync(stateFile, 'utf8'));

export const writeState = (state: Partial<RunState>) => {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
};

export const removeState = () => fs.rmSync(stateFile, { force: true });
