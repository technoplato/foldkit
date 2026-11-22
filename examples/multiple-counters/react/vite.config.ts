import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'multiple-counters-core-example'],
  },
  preview: {
    allowedHosts: ['counters.knophy.com', 'counters.pisspoursoftware.xyz'],
  },
  server: {
    host: '127.0.0.1',
    port: 5217,
    strictPort: true,
    allowedHosts: ['counters.knophy.com', 'counters.pisspoursoftware.xyz'],
    fs: {
      allow: ['../../../'],
    },
  },
})
