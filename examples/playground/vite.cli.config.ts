import path from 'node:path'
import { defineConfig } from 'vite'

import { foldkitAliases } from '../vite.aliases'

export default defineConfig({
  resolve: {
    alias: {
      '@foldkit/instant/browser': path.resolve(
        __dirname,
        '../../packages/instant/src/browser.ts',
      ),
      '@foldkit/instant/snapshot-log': path.resolve(
        __dirname,
        '../../packages/instant/src/snapshotLog/index.ts',
      ),
      '@foldkit/instant': path.resolve(
        __dirname,
        '../../packages/instant/src/nodeDatabase/index.ts',
      ),
      'foldkit/cli/host': path.resolve(
        __dirname,
        '../../packages/foldkit/src/cli/host.ts',
      ),
      'foldkit/cli/view': path.resolve(
        __dirname,
        '../../packages/foldkit/src/cli/view.ts',
      ),
      'foldkit/cli': path.resolve(
        __dirname,
        '../../packages/foldkit/src/cli/public.ts',
      ),
      ...foldkitAliases(path.resolve(__dirname)),
    },
  },
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: true,
    outDir: 'dist-cli',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cli: path.resolve(__dirname, 'cli.ts'),
        studioEntry: path.resolve(__dirname, 'cli/studioEntry.ts'),
        playgroundEntry: path.resolve(__dirname, 'cli/playgroundEntry.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
