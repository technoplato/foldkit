import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'react-reconciler/constants': 'react-reconciler/constants.js',
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: ['@opentui/react'],
      },
    },
  },
})
