import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../vite.aliases'
import { slidesQandaPlugin } from './answerPlugin'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9966 }),
    slidesQandaPlugin(),
  ],
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  server: {
    port: 5288,
    fs: {
      allow: ['../../'],
    },
  },
})
