import { counterDemoSession } from 'counter-instant-example/vite'
import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), react(), counterDemoSession()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5216,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
})
