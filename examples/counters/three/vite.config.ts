import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: 9997 })],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
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
