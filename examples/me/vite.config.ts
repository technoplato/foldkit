import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { siteSourceHeader } from '../site-source-header'
import { foldkitAliases } from '../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit(), siteSourceHeader()],
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  server: {
    fs: {
      allow: ['../../'],
    },
  },
})
