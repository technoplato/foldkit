import {
  audibleDemoLanding,
  audibleImportEndpoint,
  demoBridge,
  demoLibraryImport,
  memoryVault,
} from 'books-core-example/audible-endpoint'
import {
  booksLinkPreviews,
  instantTitlesLoader,
} from 'books-core-example/link-previews'
import {
  readAloudBooksLoader,
  thingsDirectoryFromEnv,
} from 'read-aloud-core-example'
import { readAloudEndpoint } from 'read-aloud-core-example/endpoint'
import { type PluginOption, defineConfig } from 'vite'

import {
  foldkitTelemetry,
  hostedIdentity,
} from '@foldkit/instant/hosted-identity/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../vite.aliases'

const port = 5183

const envValue = (name: string): string => process.env[name]?.trim() ?? ''

const previewEmail = envValue('BOOKS_PUBLIC_PREVIEW_EMAIL')
const appId = envValue('INSTANT_APP_ID') || envValue('VITE_INSTANT_APP_ID')
const adminToken = envValue('INSTANT_APP_ADMIN_TOKEN')

const linkPreviews = booksLinkPreviews({
  origin:
    envValue('BOOKS_PUBLIC_ORIGIN') || 'https://books.pisspoursoftware.xyz',
  loadTitles:
    previewEmail !== '' && appId !== '' && adminToken !== ''
      ? instantTitlesLoader({ appId, adminToken, ownerEmail: previewEmail })
      : async () => [],
  fetchCover: url => fetch(url),
  loadReadAloudBooks: readAloudBooksLoader(thingsDirectoryFromEnv()),
})

const audibleImport = (): ReadonlyArray<PluginOption> =>
  envValue('BOOKS_AUDIBLE_DEMO') === '1'
    ? [
        audibleDemoLanding(),
        audibleImportEndpoint({
          bridge: demoBridge,
          vault: memoryVault,
          libraryImport: demoLibraryImport({ appId, adminToken }),
        }),
      ]
    : [audibleImportEndpoint()]

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    hostedIdentity({ publicRoutes: linkPreviews }),
    foldkitTelemetry(),
    readAloudEndpoint(),
    ...audibleImport(),
  ],
  resolve: {
    alias: instantBrowserAlias,
  },
  optimizeDeps: {
    exclude: [
      '@foldkit/instant',
      'books-core-example',
      'read-aloud-core-example',
      'read-aloud-react-bindings-example',
    ],
  },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    fs: {
      allow: ['../../../'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    allowedHosts: ['books.knophy.com', 'books.pisspoursoftware.xyz'],
  },
})
