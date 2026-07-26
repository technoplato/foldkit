import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

const demoHeaders = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
}

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9990 })],
  preview: {
    allowedHosts: ['foldkitdemo.knophy.com'],
    headers: demoHeaders,
  },
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    allowedHosts: ['foldkitdemo.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
    headers: demoHeaders,
  },
})
