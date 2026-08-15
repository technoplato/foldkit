import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [svelte(), hostedIdentity(), countersDemoSession()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5210,
    fs: {
      allow: ['../../../'],
    },
  },
})
