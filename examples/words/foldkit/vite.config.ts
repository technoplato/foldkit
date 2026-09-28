import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'
import {
  appleAppSiteAssociation,
  devImpersonation,
  wordsHostedIdentity,
} from './vitePlugins'

export default defineConfig({
  appType: 'spa',
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9996 }),
    appleAppSiteAssociation(),
    devImpersonation(),
    wordsHostedIdentity(),
  ],
  resolve: {
    alias: {
      'words-core-example': path.resolve(__dirname, '../core/src/index.ts'),
      ...instantBrowserAlias,
      ...foldkitAliases(path.resolve(__dirname, '..')),
    },
  },
  server: {
    port: 5231,
    allowedHosts: ['words.knophy.com'],
    fs: { allow: ['../../../'] },
  },
  preview: {
    host: '127.0.0.1',
    port: 5232,
    allowedHosts: ['words.knophy.com'],
  },
})
