import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte(), hostedIdentity(), countersDemoSession()],
  server: {
    port: 5210,
    fs: {
      allow: ['../../../'],
    },
  },
})
