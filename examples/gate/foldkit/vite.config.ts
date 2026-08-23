import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9993 })],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      'gate-core-example': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['gate-core-example'],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        mobile: path.resolve(__dirname, 'mobile.html'),
      },
    },
  },
  server: {
    port: 5218,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5212,
    strictPort: true,
    allowedHosts: [
      'gate.knophy.com',
      'surface.gate.knophy.com',
      'mobile.gate.knophy.com',
      'foldkit.gate.knophy.com',
      'react.gate.knophy.com',
      'svelte.gate.knophy.com',
      'expo.gate.knophy.com',
      'cli.gate.knophy.com',
      'tui.gate.knophy.com',
      'opentui.gate.knophy.com',
      'headless.gate.knophy.com',
      'gate-foldkit.knophy.com',
      'gate-react.knophy.com',
      'gate-svelte.knophy.com',
      'gate-expo.knophy.com',
      'gate-cli.knophy.com',
      'gate-tui.knophy.com',
      'gate-opentui.knophy.com',
      'gate-headless.knophy.com',
      'gate-mobile.knophy.com',
      'gate-surface.knophy.com',
    ],
  },
})
