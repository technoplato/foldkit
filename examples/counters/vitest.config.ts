import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    exclude: [
      ...configDefaults.exclude,
      'cli/**',
      'core/**',
      'expo/**',
      'headless/**',
      'instant-host/**',
      'opentui/**',
      'react/**',
      'react-bindings/**',
      'svelte/**',
      'sveltekit/**',
      'terminal/**',
      'three/**',
      'vue/**',
    ],
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
      },
    },
  },
})
