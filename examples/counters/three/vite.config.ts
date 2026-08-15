import { countersDemoSession } from 'counters-instant-example/vite'
import path from 'path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [
    foldkit({ devToolsMcpPort: 9997 }),
    hostedIdentity(),
    countersDemoSession(),
  ],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
    },
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5188,
    allowedHosts: ['counters-three.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5208,
    allowedHosts: ['counters-three.knophy.com'],
  },
})
