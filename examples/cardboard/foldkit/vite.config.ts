import { cardboardWebPreview } from 'cardboard-web-preview-example'
import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [
    cardboardWebPreview({
      deepLinkOrigin: 'foldkit://showcase',
      pageOrigin: 'https://cardboard-foldkit.knophy.com',
    }),
    foldkit({ devToolsMcpPort: 9996 }),
  ],
  resolve: { alias: foldkitAliases(path.resolve(__dirname, '..')) },
  server: {
    allowedHosts: ['cardboard-foldkit.knophy.com'],
    fs: { allow: ['../../../'] },
  },
})
