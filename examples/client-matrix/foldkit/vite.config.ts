import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9994 })],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    allowedHosts: ['matrix.knophy.com', 'matrixdemo.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    allowedHosts: ['matrix.knophy.com', 'matrixdemo.knophy.com'],
  },
})
