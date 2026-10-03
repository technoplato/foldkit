import { defineConfig } from 'vite'

import { svelte } from '@sveltejs/vite-plugin-svelte'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'multiple-counters-core-example'],
  },
  server: {
    port: 5219,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
})
