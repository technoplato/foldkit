import path from 'path'
import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: foldkitAliases(path.resolve(__dirname, '..')),
  },
  server: {
    port: 5190,
    allowedHosts: ['world.knophy.com'],
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5218,
    allowedHosts: ['world.knophy.com'],
  },
})
