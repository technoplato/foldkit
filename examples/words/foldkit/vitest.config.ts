import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'aliases.test.ts',
      'vitePlugins.test.ts',
      'themePlugin.test.ts',
      'src/**/*.test.ts',
    ],
  },
})
