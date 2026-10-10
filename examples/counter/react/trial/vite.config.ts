import path from 'path'
import { defineConfig } from 'vite'

import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../../vite.aliases'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: {
    alias: {
      ...instantBrowserAlias,
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: { exclude: ['@foldkit/instant', 'counter-core-example'] },
  server: {
    host: '127.0.0.1',
    port: 5393,
    strictPort: true,
    fs: { allow: [path.resolve(import.meta.dirname, '../../../../')] },
  },
})
