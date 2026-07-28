import { cardboardWebPreview } from 'cardboard-web-preview-example'
import { defineConfig } from 'vite'

import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    cardboardWebPreview({
      deepLinkOrigin: 'foldkit://showcase',
      pageOrigin: 'https://cardboard.knophy.com',
    }),
    react(),
  ],
  server: { allowedHosts: ['cardboard.knophy.com'] },
})
