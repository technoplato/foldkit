import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../vite.aliases'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9989 }),
    hostedIdentity(),
    countersDemoSession(),
  ],
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  server: {
    fs: {
      allow: ['../../'],
    },
  },
})
