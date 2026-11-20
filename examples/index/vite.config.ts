import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit()],
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8789',
    },
    fs: {
      allow: ['../../'],
    },
  },
})
