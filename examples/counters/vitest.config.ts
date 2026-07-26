import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    exclude: [
      ...configDefaults.exclude,
      'cli/**',
      'core/**',
      'react/**',
      'react-bindings/**',
    ],
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
      },
    },
  },
})
