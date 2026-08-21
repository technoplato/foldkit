import path from 'path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9991 }),
    hostedIdentity(),
  ],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5180,
    allowedHosts: ['books.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5200,
    allowedHosts: ['books.knophy.com'],
  },
})
