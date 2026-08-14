import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    exclude: [
      ...configDefaults.exclude,
      'cli/**',
      'core/**',
      'expo/**',
      'instant-host/**',
      'opentui/**',
      'react/**',
      'react-bindings/**',
      'terminal/**',
      'three/**',
    ],
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
      },
    },
  },
})
