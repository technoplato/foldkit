import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { foldkitAliases } from '../vite.aliases'

const demoHeaders = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  preview: {
    allowedHosts: ['reactdemo.knophy.com'],
    headers: demoHeaders,
  },
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  server: {
    allowedHosts: ['reactdemo.knophy.com'],
    headers: demoHeaders,
  },
})
