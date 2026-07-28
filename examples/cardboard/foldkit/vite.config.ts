import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: 9996 })],
  resolve: { alias: foldkitAliases(path.resolve(__dirname, '..')) },
  server: {
    allowedHosts: ['cardboard-foldkit.knophy.com'],
    fs: { allow: ['../../../'] },
  },
})
