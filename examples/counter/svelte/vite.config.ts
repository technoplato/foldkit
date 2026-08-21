import { defineConfig } from 'vite'

import { svelte } from '@sveltejs/vite-plugin-svelte'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'counter-core-example'],
  },
  server: {
    port: 5218,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
})
