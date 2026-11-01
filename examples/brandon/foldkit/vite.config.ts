import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

export default defineConfig({
  plugins: [foldkit()],
  server: { host: '127.0.0.1', fs: { allow: ['../../../'] } },
})
