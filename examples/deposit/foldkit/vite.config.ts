import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9994 })],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5184,
    allowedHosts: ['deposit.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5204,
    allowedHosts: ['deposit.knophy.com'],
  },
})
