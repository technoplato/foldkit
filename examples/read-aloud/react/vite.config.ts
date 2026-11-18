import { readAloudEndpoint } from 'read-aloud-core-example/endpoint'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

const port = 5184

export default defineConfig({
  plugins: [tailwindcss(), react(), hostedIdentity(), readAloudEndpoint()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: [
      '@foldkit/instant',
      'read-aloud-core-example',
      'read-aloud-react-bindings-example',
    ],
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
  },
})
