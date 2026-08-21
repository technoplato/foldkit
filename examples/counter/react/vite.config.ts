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
    exclude: ['@foldkit/instant', 'counter-core-example'],
  },
  server: {
    host: '127.0.0.1',
    port: 5216,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
})
