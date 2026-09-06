import { log } from './env';
import { stopPlatform } from './platform';
import { cleanupSeed } from './seed';
import type { RunState } from './state';
import { stopProcessGroup } from './tolgeeJs';

export const teardown = async (state: Partial<RunState>) => {
  for (const pid of state.testappPids ?? []) {
    log(`stopping testapp process group ${pid}`);
    stopProcessGroup(pid);
  }
  if (state.tolgeeUrl && state.seed) {
    await cleanupSeed(state.tolgeeUrl, state.seed).catch((e) =>
      console.warn('[e2e] test data cleanup failed', e)
    );
  }
  if (state.docker) {
    stopPlatform();
  }
};
