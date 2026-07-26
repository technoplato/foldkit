import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  preview: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
  server: {
    allowedHosts: ['countersdemo.knophy.com'],
  },
})
