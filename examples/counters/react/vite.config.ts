import { countersDemoSession } from 'counters-instant-example/vite'
import path from 'path'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react(), hostedIdentity(), countersDemoSession()],
  resolve: {
    alias: {
      'node:crypto': path.resolve(__dirname, 'src/cryptoBrowser.ts'),
      'node:fs': path.resolve(__dirname, 'src/cryptoBrowser.ts'),
      'node:module': path.resolve(__dirname, 'src/cryptoBrowser.ts'),
    },
  },
  preview: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
  server: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
})
