import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: 9993 })],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5189,
    allowedHosts: ['world.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5207,
    allowedHosts: ['world.knophy.com'],
  },
})
