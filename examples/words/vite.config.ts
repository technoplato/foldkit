import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../vite.aliases'

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/public.ts'),
      fileName: 'words',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'words-[name].js',
        entryFileNames: 'words.js',
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [foldkit({ devToolsMcpPort: 9989 })],
  resolve: { alias: foldkitAliases(__dirname) },
  server: { fs: { allow: ['../../'] } },
})
