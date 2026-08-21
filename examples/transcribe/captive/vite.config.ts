import path from 'path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9993 }),
    hostedIdentity(),
  ],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5189,
    fs: { allow: ['../../../'] },
  },
  preview: {
    host: '127.0.0.1',
    port: 5203,
  },
})
