import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Plugin, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'

const knophyHosts = ['casino.knophy.com']

const stripeEnvNames = [
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'STRIPE_KEY',
  'STRIPE_SECRET',
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_TEST_SECRET_KEY',
  'STRIPE_LIVE_SECRET_KEY',
  'VITE_STRIPE_SECRET_KEY',
  'VITE_STRIPE_API_KEY',
]

const stripeConfigRelpaths = [
  '.config/stripe',
  '.config/stripe/config.toml',
  '.config/stripe/secret',
  '.stripe',
  '.stripe/config.toml',
]

const stripeEnvPresentAtBuild = stripeEnvNames.some(name => {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== ''
})

const stripeConfigFilePresentAtBuild = stripeConfigRelpaths.some(relpath =>
  fs.existsSync(path.join(os.homedir(), relpath)),
)

/** Serves /mobile.html as / when the Host is the phone wrapper. */
const mobileHostIndex = (): Plugin => ({
  name: 'mobile-host-index',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const host = (req.headers.host ?? '').split(':').at(0) ?? ''
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
  define: {
    'import.meta.env.VITE_STRIPE_SECRET_PRESENT': JSON.stringify(
      stripeEnvPresentAtBuild ? 'true' : 'false',
    ),
    'import.meta.env.VITE_STRIPE_CONFIG_FILE_PRESENT': JSON.stringify(
      stripeConfigFilePresentAtBuild ? 'true' : 'false',
    ),
  },
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9990 }),
    mobileHostIndex(),
  ],
  resolve: {
    alias: {
      ...foldkitAliases(path.resolve(__dirname, '..')),
      ...instantBrowserAlias,
      'casino-core-example': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['casino-core-example'],
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
    port: 5219,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5215,
    strictPort: true,
    allowedHosts: knophyHosts,
  },
})
