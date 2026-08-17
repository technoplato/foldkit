import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9988 })],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
    },
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5215,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
})
