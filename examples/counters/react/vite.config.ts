import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), react(), hostedIdentity(), countersDemoSession()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  preview: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
  server: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
})
