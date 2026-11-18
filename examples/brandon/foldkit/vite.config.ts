import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { siteSourceHeader } from '../../site-source-header'

export default defineConfig({
  plugins: [foldkit(), siteSourceHeader()],
  server: { host: '127.0.0.1', fs: { allow: ['../../../'] } },
})
