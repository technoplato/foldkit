import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../../vite.aliases'

const tillProxy = {
  '/till': {
    target: 'http://127.0.0.1:5208',
    rewrite: (pathname: string) => pathname.replace(/^\/till/u, ''),
  },
}

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: 9996 })],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5186,
    allowedHosts: ['vending.knophy.com', 'store.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
    proxy: tillProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 5205,
    allowedHosts: ['vending.knophy.com', 'store.knophy.com'],
    proxy: tillProxy,
  },
})
