import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: [
          'archiver-core-example',
          'foldkit',
          '@foldkit/ui',
          '@foldkit/devtools',
        ],
      },
    },
  },
})
