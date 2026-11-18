import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import { instantBrowserAlias } from '../../../vite.aliases'

// The made-up page needs none of the live site's plugins: no sign-in, no
// library, no import. It serves the same App on the made-up library, at
// every address the site has, such as /books.
export default defineConfig({
  root: import.meta.dirname,
  appType: 'spa',
  plugins: [tailwindcss(), react()],
  resolve: { alias: instantBrowserAlias },
  optimizeDeps: {
    exclude: [
      '@foldkit/instant',
      'books-core-example',
      'read-aloud-core-example',
      'read-aloud-react-bindings-example',
    ],
  },
  server: {
    port: 5249,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: ['../../../..'] },
  },
})
