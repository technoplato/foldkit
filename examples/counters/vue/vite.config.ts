import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue(), hostedIdentity(), countersDemoSession()],
  server: {
    port: 5212,
    fs: {
      allow: ['../../../'],
    },
  },
})
