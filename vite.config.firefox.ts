import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import zipPack from 'vite-plugin-zip-pack';

import manifest from './manifest.json';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist-firefox',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    crx({ manifest: manifest as any, browser: 'firefox' }),
    zipPack({ inDir: 'dist-firefox', outFileName: 'firefox.zip' }),
  ],
});
