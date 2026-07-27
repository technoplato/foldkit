import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: [
          'wallet-core-example',
          'wallet-simulated-client-example',
          'foldkit',
          '@foldkit/devtools',
        ],
      },
    },
  },
})
