import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react(), hostedIdentity(), countersDemoSession()],
  preview: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
  server: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
})
