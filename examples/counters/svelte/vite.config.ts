import { execSync } from 'node:child_process'

import { countersDemoSession } from 'counters-instant-example/vite'
import { defineConfig } from 'vite'

import { hostedIdentity } from '@foldkit/instant/hosted-identity/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

import { instantBrowserAlias } from '../../vite.aliases'

/** Derives this checkout's GitHub URL from its own git remote. Never hardcoded. */
const githubSourceUrl = (): string => {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      cwd: __dirname,
    }).trim()
    const https = /^https:\/\/[^/]+\/(.+?)(?:\.git)?$/u.exec(remote)
    if (https !== null) return `https://github.com/${https[1] ?? ''}`
    const ssh = /^git@[^:]+:(.+?)(?:\.git)?$/u.exec(remote)
    if (ssh !== null) return `https://github.com/${ssh[1] ?? ''}`
  } catch {
    // No origin or no git: the banner renders without attribution.
  }
  return ''
}

export default defineConfig({
  plugins: [svelte(), hostedIdentity(), countersDemoSession()],
  resolve: {
    alias: instantBrowserAlias,
  },
  define: {
    __GITHUB_SOURCE_URL__: JSON.stringify(githubSourceUrl()),
  },
  optimizeDeps: {
    exclude: ['@foldkit/instant'],
  },
  server: {
    port: 5210,
    fs: {
      allow: ['../../../'],
    },
  },
})
