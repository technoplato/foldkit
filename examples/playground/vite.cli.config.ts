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
    noExternal: [/^foldkit/u, /^@foldkit/u],
    external: ['effect', '@instantdb/core'],
  },
  build: {
    ssr: true,
    outDir: 'dist-cli',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cli: path.resolve(__dirname, 'cli.ts'),
        studioEntry: path.resolve(__dirname, 'cli/studioEntry.ts'),
        studioDaemon: path.resolve(__dirname, 'cli/studioDaemon.ts'),
        studioInProcess: path.resolve(__dirname, 'cli/studioInProcess.ts'),
        playgroundEntry: path.resolve(__dirname, 'cli/playgroundEntry.ts'),
        playgroundDaemon: path.resolve(__dirname, 'cli/playgroundDaemon.ts'),
        playgroundInProcess: path.resolve(
          __dirname,
          'cli/playgroundInProcess.ts',
        ),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
