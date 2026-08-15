import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import vue from '@vitejs/plugin-vue'

import { instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [vue(), hostedIdentity(), countersDemoSession()],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5212,
    fs: {
      allow: ['../../../'],
    },
  },
})
