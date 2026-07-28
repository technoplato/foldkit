import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitAliases } from '../../vite.aliases'

const buildProvenance =
  process.env['FOLDKIT_BUILD_PROVENANCE_JSON'] ??
  JSON.stringify({ status: 'development build without embedded provenance' })

export default defineConfig({
  define: { __BUILD_PROVENANCE__: buildProvenance },
  plugins: [foldkit({ devToolsMcpPort: 9995 })],
  resolve: { alias: foldkitAliases(path.resolve(__dirname, '..')) },
  server: {
    fs: { allow: ['../../../'] },
  },
})
