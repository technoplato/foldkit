import path from 'path'
import { type Plugin, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

const knophyHosts = ['ingest.knophy.com']

/** Serves /mobile.html as / when the Host is the phone wrapper. */
const mobileHostIndex = (): Plugin => ({
  name: 'mobile-host-index',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const host = (req.headers.host ?? '').split(':')[0]
      if (
        host.startsWith('mobile.') &&
        (req.url === '/' || req.url === '/index.html')
      ) {
        req.url = '/mobile.html'
      }
      next()
    })
  },
})

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9989 }),
    mobileHostIndex(),
  ],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
      'ingest-core-example': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['ingest-core-example'],
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
    port: 5214,
    strictPort: true,
    allowedHosts: knophyHosts,
  },
})
