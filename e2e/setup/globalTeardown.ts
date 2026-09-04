import fs from 'node:fs';
import { stateFile } from './env';
import { readState, removeState } from './state';
import { teardown } from './teardown';

export default async function globalTeardown() {
  if (!fs.existsSync(stateFile)) {
    return;
  }
  await teardown(readState());
  removeState();
}
