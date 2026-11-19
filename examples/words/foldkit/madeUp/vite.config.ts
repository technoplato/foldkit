import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../../vite.aliases'
import { wordsThemeHead } from '../themePlugin'

// The words page on made-up recordings. It serves this folder, with the
// site's own source and public files beside it, and reads no private
// environment: nothing here reaches Scribe's Instant or the words origin.
export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, '../public'),
  appType: 'spa',
  plugins: [
    wordsThemeHead(),
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9995 }),
  ],
  resolve: {
    alias: {
      'words-core-example': path.resolve(__dirname, '../../core/src/index.ts'),
      ...instantBrowserAlias,
      ...foldkitAliases(path.resolve(__dirname, '../..')),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5236,
    strictPort: true,
    fs: { allow: ['../../../../'] },
  },
})
