import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { sveltekit } from '@sveltejs/kit/vite'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [sveltekit(), hostedIdentity(), countersDemoSession()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5211,
    fs: {
      allow: ['../../../'],
    },
  },
})
