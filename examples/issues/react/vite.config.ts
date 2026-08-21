import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), hostedIdentity()],
})
