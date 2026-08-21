import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react(), hostedIdentity()],
  server: { port: 5184 },
  preview: {
    host: '127.0.0.1',
    port: 5202,
    allowedHosts: ['ideas-react.knophy.com'],
  },
})
