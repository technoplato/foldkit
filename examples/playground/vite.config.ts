import path from 'node:path'
import { defineConfig } from 'vite'

import { foldkitAliases, instantBrowserAlias } from '../vite.aliases'

export default defineConfig({
  base: '/',
  appType: 'spa',
  resolve: {
    alias: {
      ...instantBrowserAlias,
      ...foldkitAliases(path.resolve(__dirname)),
    },
  },
  server: {
    port: 5221,
    allowedHosts: ['foldkit.pisspoursoftware.xyz', 'foldkit.knophy.com'],
    fs: { allow: ['../../'] },
  },
  preview: {
    host: '127.0.0.1',
    port: 5221,
    allowedHosts: ['foldkit.pisspoursoftware.xyz', 'foldkit.knophy.com'],
  },
})
