import path from 'path'
import { type Plugin, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

const knophyHosts = [
  'counter.knophy.com',
  'surface.counter.knophy.com',
  'foldkit.counter.knophy.com',
  'react.counter.knophy.com',
  'svelte.counter.knophy.com',
  'expo.counter.knophy.com',
  'cli.counter.knophy.com',
  'tui.counter.knophy.com',
  'opentui.counter.knophy.com',
  'headless.counter.knophy.com',
  'mobile.counter.knophy.com',
  'mobile-counter.knophy.com',
  'counter-mobile.knophy.com',
  'counter-foldkit.knophy.com',
  'counter-react.knophy.com',
  'counter-svelte.knophy.com',
  'counter-expo.knophy.com',
  'counter-cli.knophy.com',
  'counter-tui.knophy.com',
  'counter-opentui.knophy.com',
  'counter-headless.knophy.com',
  'counter-surface.knophy.com',
]

/** Serves /mobile.html as / when the Host is the phone wrapper. */
const mobileHostIndex = (): Plugin => ({
  name: 'mobile-host-index',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const host = (req.headers.host ?? '').split(':')[0]
      const isPhoneHost =
        host.startsWith('mobile.') ||
        host === 'mobile-counter.knophy.com' ||
        host.startsWith('mobile-') ||
        host === 'counter-mobile.knophy.com' ||
        host.endsWith('-mobile.knophy.com')
      if (isPhoneHost && (req.url === '/' || req.url === '/index.html')) {
        req.url = '/mobile.html'
      }
      next()
    })
  },
})

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9988 }),
    mobileHostIndex(),
  ],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
    },
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant', 'counter-core-example'],
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
    port: 5215,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5210,
    strictPort: true,
    allowedHosts: knophyHosts,
  },
})
