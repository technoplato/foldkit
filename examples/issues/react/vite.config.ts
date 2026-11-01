import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import react from '@vitejs/plugin-react'

import { siteSourceHeader } from '../../site-source-header'

export default defineConfig({
  plugins: [
    react(),
    hostedIdentity(),
    hostedIdentity({
      session: {
        path: '/__foldkit/hosted-identity/scribe/session',
        appIdEnv: 'SCRIBE_MAIN_INSTANT_APP_ID',
        adminTokenEnv: 'SCRIBE_MAIN_INSTANT_ADMIN_TOKEN',
      },
    }),
    siteSourceHeader(),
  ],
})
