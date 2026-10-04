import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

const port = 5183

export default defineConfig({
  plugins: [tailwindcss(), react(), hostedIdentity()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'books-core-example'],
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
    allowedHosts: ['books.pisspoursoftware.xyz'],
  },
})
