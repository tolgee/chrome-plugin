import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import zipPack from 'vite-plugin-zip-pack';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import fs from 'node:fs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import path from 'node:path';

import manifest from './manifest.json';

function myPlugin(): Plugin {
  function updateManifest() {
    const absolutePath = path.resolve('./dist-chrome/manifest.json');

    const content = fs.readFileSync(absolutePath);
    const test = JSON.parse(content);
    test.web_accessible_resources = test.web_accessible_resources.map((i) => ({
      ...i,
      use_dynamic_url: false,
    }));
    fs.writeFile(absolutePath, JSON.stringify(test, null, 2), (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('manifest.json updated');
      }
    });
  }

  return {
    name: 'my-plugin',
    generateBundle(options, bundle) {
      console.log(bundle);
    },
    writeBundle() {
      updateManifest();
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist-chrome',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    crx({ manifest: manifest as any }),
    myPlugin(),
    zipPack({ inDir: 'dist-chrome', outFileName: 'chrome.zip' }),
  ],
});
