import { resolve } from 'node:path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

const port = 5223

export default defineConfig({
  plugins: [react(), hostedIdentity()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'reminders-core-example'],
  },
  build: {
    rollupOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
    },
  },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    allowedHosts: ['reminders.knophy.com'],
  },
})
