import { execSync } from 'node:child_process'

import { defineConfig } from 'vite'

/**
 * Derives this checkout's GitHub URL from its own git remote. Never hardcoded.
 */
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
  define: {
    __GITHUB_SOURCE_URL__: JSON.stringify(githubSourceUrl()),
  },
})
