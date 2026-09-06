import { Plugin } from 'vite';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import fs from 'node:fs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import path from 'node:path';

// The packaged extension carries icon paths derived from Material Design (Apache-2.0) and a bundled
// react-transition-group (BSD-3-Clause), whose terms require the licence texts and the NOTICE to travel with them.
const FILES = [
  'LICENSE',
  'LICENSE-APACHE-2.0',
  'LICENSE-BSD-3-CLAUSE',
  'NOTICE',
];

export function licenseFiles(outDir: string): Plugin {
  return {
    name: 'license-files',
    writeBundle() {
      for (const file of FILES) {
        fs.copyFileSync(path.resolve(file), path.resolve(outDir, file));
      }
    },
  };
}
