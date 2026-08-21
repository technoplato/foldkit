import path from 'path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'
import { transcribeApiPlugin } from './transcribeApiPlugin'

export default defineConfig({
  appType: 'spa',
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9995 }),
    transcribeApiPlugin(),
    hostedIdentity(),
  ],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5186,
    allowedHosts: ['transcribe.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5202,
    allowedHosts: ['transcribe.knophy.com'],
  },
})
