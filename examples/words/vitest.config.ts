import { defineConfig } from 'vitest/config'

import { foldkitAliases } from '../vite.aliases'

export default defineConfig({
  resolve: { alias: foldkitAliases(__dirname) },
  test: { environment: 'happy-dom' },
})
