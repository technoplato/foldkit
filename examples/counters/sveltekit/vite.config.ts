import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
  plugins: [sveltekit(), hostedIdentity(), countersDemoSession()],
  server: {
    port: 5211,
    fs: {
      allow: ['../../../'],
    },
  },
})
