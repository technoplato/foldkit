import path from 'path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9999 }),
    hostedIdentity(),
  ],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    host: '127.0.0.1',
    port: 5211,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
})
