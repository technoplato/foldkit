import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9988 })],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
    },
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'puzzle-core-example'],
  },
  server: {
    port: 5209,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5209,
    strictPort: true,
    allowedHosts: [
      'puzzle.knophy.com',
      'replicate.knophy.com',
      'grok.knophy.com',
      'foldkit.puzzle.knophy.com',
      'react.puzzle.knophy.com',
      'svelte.puzzle.knophy.com',
      'expo.puzzle.knophy.com',
      'cli.puzzle.knophy.com',
      'tui.puzzle.knophy.com',
      'opentui.puzzle.knophy.com',
      'headless.puzzle.knophy.com',
      'foldkit-puzzle.knophy.com',
      'react-puzzle.knophy.com',
      'svelte-puzzle.knophy.com',
      'expo-puzzle.knophy.com',
      'cli-puzzle.knophy.com',
      'tui-puzzle.knophy.com',
      'opentui-puzzle.knophy.com',
      'headless-puzzle.knophy.com',
      'puzzle-foldkit.knophy.com',
      'puzzle-react.knophy.com',
      'puzzle-svelte.knophy.com',
      'puzzle-expo.knophy.com',
      'puzzle-cli.knophy.com',
      'puzzle-tui.knophy.com',
      'puzzle-opentui.knophy.com',
      'puzzle-headless.knophy.com',
      'puzzle-mobile.knophy.com',
      'puzzle-surface.knophy.com',
    ],
  },
})
